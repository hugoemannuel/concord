package message

import (
	"reflect"
	"testing"
	"time"

	"github.com/google/uuid"
)

func inserirMensagemComPrazo(t *testing.T, s *searchDB, expiresAt any) string {
	t.Helper()
	id := uuid.NewString()
	if _, err := s.db.Exec(s.ctx, `INSERT INTO messages (id, author_id, conversation_id, content, expires_at) VALUES ($1, $2, $3, 'x', $4)`,
		id, s.users["ana"], s.convID, expiresAt); err != nil {
		t.Fatal(err)
	}
	return id
}

func existeMensagem(t *testing.T, s *searchDB, id string) bool {
	t.Helper()
	var n int
	if err := s.db.QueryRow(s.ctx, `SELECT count(*) FROM messages WHERE id = $1`, id).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n == 1
}

func TestDeleteExpiredSoApagaVencidas(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	now := time.Now()
	vencida := inserirMensagemComPrazo(t, s, now.Add(-time.Minute))
	futura := inserirMensagemComPrazo(t, s, now.Add(time.Hour))
	sem := inserirMensagemComPrazo(t, s, nil)
	attID := uuid.NewString()
	if _, err := s.db.Exec(s.ctx, `INSERT INTO message_attachments (id, message_id, uploader_id, conversation_id, kind, content_type, filename, size_bytes)
		VALUES ($1, $2, $3, $4, 'image', 'image/png', 'a.png', 10)`, attID, vencida, s.users["ana"], s.convID); err != nil {
		t.Fatal(err)
	}

	got, err := repo.DeleteExpired(s.ctx, now, 500)
	if err != nil {
		t.Fatal(err)
	}
	// O banco de teste é compartilhado: só conta o que é desta conversa.
	var proprias []ExpiredMessage
	for _, m := range got {
		if m.ConversationID == s.convID {
			proprias = append(proprias, m)
		}
	}
	got = proprias
	want := []ExpiredMessage{{ID: vencida, ConversationID: s.convID, AttachmentIDs: []string{attID}}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("DeleteExpired = %+v, want %+v", got, want)
	}
	if existeMensagem(t, s, vencida) || !existeMensagem(t, s, futura) || !existeMensagem(t, s, sem) {
		t.Fatal("só a vencida deveria sumir")
	}
	var n int
	if err := s.db.QueryRow(s.ctx, `SELECT count(*) FROM message_attachments WHERE id = $1`, attID).Scan(&n); err != nil || n != 0 {
		t.Fatalf("anexo da vencida deveria sumir por cascata (n=%d, err=%v)", n, err)
	}
}

func TestDeleteExpiredRespeitaLimite(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	now := time.Now()
	for i := 0; i < 3; i++ {
		inserirMensagemComPrazo(t, s, now.Add(-time.Minute))
	}
	got, err := repo.DeleteExpired(s.ctx, now, 2)
	if err != nil || len(got) != 2 {
		t.Fatalf("len = %d, err = %v, want 2", len(got), err)
	}
}

func TestExpireViewOnceSoAntigasNaoVistasPorTodos(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	msg := inserirMensagemComPrazo(t, s, nil)
	novo := func(viewOnce bool, idade time.Duration, gone any, comMensagem bool) string {
		id := uuid.NewString()
		var m any
		if comMensagem {
			m = msg
		}
		if _, err := s.db.Exec(s.ctx, `INSERT INTO message_attachments (id, message_id, uploader_id, conversation_id, kind, content_type, filename, size_bytes, view_once, view_once_gone_at, created_at)
			VALUES ($1, $2, $3, $4, 'image', 'image/png', 'a.png', 10, $5, $6, $7)`,
			id, m, s.users["ana"], s.convID, viewOnce, gone, time.Now().Add(-idade)); err != nil {
			t.Fatal(err)
		}
		return id
	}
	antiga := novo(true, 15*24*time.Hour, nil, true)
	novo(true, time.Hour, nil, true)              // recente
	novo(true, 15*24*time.Hour, time.Now(), true) // já apagada
	novo(false, 15*24*time.Hour, nil, true)       // não é visualização única
	novo(true, 15*24*time.Hour, nil, false)       // pendente (sem mensagem)

	got, err := repo.ExpireViewOnce(s.ctx, time.Now().Add(-ViewOnceTTL), time.Now().Add(-ViewOnceOpenWindow))
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, []string{antiga}) {
		t.Fatalf("ExpireViewOnce = %v, want [%s]", got, antiga)
	}
	var gone *time.Time
	if err := s.db.QueryRow(s.ctx, `SELECT view_once_gone_at FROM message_attachments WHERE id = $1`, antiga).Scan(&gone); err != nil || gone == nil {
		t.Fatalf("view_once_gone_at não marcado (err=%v)", err)
	}
	if again, _ := repo.ExpireViewOnce(s.ctx, time.Now().Add(-ViewOnceTTL), time.Now().Add(-ViewOnceOpenWindow)); len(again) != 0 {
		t.Fatalf("segunda passada devolveu %v", again)
	}
}

// verEm grava a visualização de userID no anexo, idade atrás.
func verEm(t *testing.T, s *searchDB, att, userID string, idade time.Duration) {
	t.Helper()
	if _, err := s.db.Exec(s.ctx, `INSERT INTO attachment_views (attachment_id, user_id, viewed_at) VALUES ($1, $2, $3)`,
		att, userID, time.Now().Add(-idade)); err != nil {
		t.Fatal(err)
	}
}

// Todos viram e a última visualização passou da janela do token (5 min): o
// arquivo sai. Antes disso, quem abriu ainda carrega e avança o vídeo.
func TestExpireViewOnceDepoisDeTodosVeremEDaJanela(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	bia, caio := s.users["bia"], s.users["caio"]

	_, vistaHa6 := enviarViewOnce(t, s, repo, caio)
	verEm(t, s, vistaHa6, caio, 6*time.Minute)
	_, vistaHa1 := enviarViewOnce(t, s, repo, caio)
	verEm(t, s, vistaHa1, caio, time.Minute)
	_, faltaUm := enviarViewOnce(t, s, repo, bia, caio)
	verEm(t, s, faltaUm, caio, 6*time.Minute)
	_, antigaAberta := enviarViewOnce(t, s, repo, bia, caio)
	verEm(t, s, antigaAberta, bia, time.Minute)
	if _, err := s.db.Exec(s.ctx, `UPDATE message_attachments SET created_at = now() - interval '15 days' WHERE id = $1`, antigaAberta); err != nil {
		t.Fatal(err)
	}

	got, err := repo.ExpireViewOnce(s.ctx, time.Now().Add(-ViewOnceTTL), time.Now().Add(-ViewOnceOpenWindow))
	if err != nil {
		t.Fatal(err)
	}
	mine := map[string]bool{vistaHa6: true, vistaHa1: true, faltaUm: true, antigaAberta: true}
	var proprios []string
	for _, id := range got {
		if mine[id] {
			proprios = append(proprios, id)
		}
	}
	if !reflect.DeepEqual(proprios, []string{vistaHa6}) {
		t.Fatalf("ExpireViewOnce = %v, want [%s]", proprios, vistaHa6)
	}
	for id, want := range map[string]bool{vistaHa6: true, vistaHa1: false, faltaUm: false, antigaAberta: false} {
		var gone bool
		if err := s.db.QueryRow(s.ctx, `SELECT view_once_gone_at IS NOT NULL FROM message_attachments WHERE id = $1`, id).Scan(&gone); err != nil || gone != want {
			t.Errorf("%s: gone = %v, want %v (err=%v)", id, gone, want, err)
		}
	}
}
