package message

import (
	"errors"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

// parVencidaEViva cria na conversa do fixture uma mensagem vencida há um
// minuto e outra sem prazo, as duas com o mesmo texto.
func parVencidaEViva(t *testing.T, s *searchDB, texto string) (vencida, viva string) {
	t.Helper()
	vencida, viva = uuid.NewString(), uuid.NewString()
	for _, id := range []string{vencida, viva} {
		if _, err := s.db.Exec(s.ctx, `INSERT INTO messages (id, author_id, conversation_id, content) VALUES ($1, $2, $3, $4)`,
			id, s.users["caio"], s.convID, texto); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := s.db.Exec(s.ctx, `UPDATE messages SET expires_at = now() - interval '1 minute' WHERE id = $1`, vencida); err != nil {
		t.Fatal(err)
	}
	return vencida, viva
}

func TestListaDaConversaEscondeVencida(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	vencida, viva := parVencidaEViva(t, s, "lista")

	for _, before := range []string{"", viva} {
		msgs, err := repo.ListByConversation(s.ctx, s.convID, 50, before)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range msgs {
			if m.ID == vencida {
				t.Fatalf("before=%q: a vencida apareceu na lista", before)
			}
		}
		if before == "" && (len(msgs) == 0 || msgs[0].ID != viva) {
			t.Fatalf("a mensagem sem prazo devia vir primeiro: %+v", msgs)
		}
	}
}

func TestFindByIDEscondeVencida(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	vencida, viva := parVencidaEViva(t, s, "find")

	if _, err := repo.FindByID(s.ctx, vencida); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("FindByID(vencida) = %v, quer pgx.ErrNoRows", err)
	}
	if _, err := repo.FindNewByID(s.ctx, vencida); !errors.Is(err, pgx.ErrNoRows) {
		t.Fatalf("FindNewByID(vencida) = %v, quer pgx.ErrNoRows", err)
	}
	if _, err := repo.FindByID(s.ctx, viva); err != nil {
		t.Fatal(err)
	}
}

func TestBuscaEscondeVencida(t *testing.T) {
	s := newSearchDB(t)
	_, viva := parVencidaEViva(t, s, "zzbuscavenc")
	s.msgs["viva"] = viva

	labels, total := s.search(t, "ana", "/api/conversations/"+s.convID+"/messages/search", params("q", "zzbuscavenc"))
	if len(labels) != 1 || labels[0] != "viva" || total != 1 {
		t.Fatalf("busca = %v (total %d), quer só a sem prazo", labels, total)
	}
}

// D11: a busca por has:image/has:video não revela mídia de visualização única.
func TestBuscaHasImageIgnoraViewOnce(t *testing.T) {
	buscaHasIgnoraViewOnce(t, "image", "image/png", "a.png")
}

func TestBuscaHasVideoIgnoraViewOnce(t *testing.T) {
	buscaHasIgnoraViewOnce(t, "video", "video/mp4", "a.mp4")
}

func buscaHasIgnoraViewOnce(t *testing.T, kind, contentType, filename string) {
	t.Helper()
	s := newSearchDB(t)
	comum, unica := uuid.NewString(), uuid.NewString()
	for id, viewOnce := range map[string]bool{comum: false, unica: true} {
		if _, err := s.db.Exec(s.ctx, `INSERT INTO messages (id, author_id, conversation_id, content) VALUES ($1, $2, $3, 'zzfoto')`, id, s.users["caio"], s.convID); err != nil {
			t.Fatal(err)
		}
		if _, err := s.db.Exec(s.ctx, `INSERT INTO message_attachments (id, message_id, uploader_id, conversation_id, kind, content_type, filename, size_bytes, view_once)
			VALUES ($1, $2, $3, $4, $5, $6, $7, 10, $8)`, uuid.NewString(), id, s.users["caio"], s.convID, kind, contentType, filename, viewOnce); err != nil {
			t.Fatal(err)
		}
	}
	s.msgs["comum"], s.msgs["unica"] = comum, unica

	labels, _ := s.search(t, "ana", "/api/conversations/"+s.convID+"/messages/search", params("q", "zzfoto", "has", kind))
	if len(labels) != 1 || labels[0] != "comum" {
		t.Fatalf("has:%s = %v, quer só a comum", kind, labels)
	}
}

func TestFavoritosEscondemVencida(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	vencida, viva := parVencidaEViva(t, s, "fav")
	ana := s.users["ana"]
	for _, id := range []string{vencida, viva} {
		if err := repo.AddFavorite(s.ctx, ana, id, 10); err != nil {
			t.Fatal(err)
		}
	}
	favs, err := repo.ListFavorites(s.ctx, ana)
	if err != nil {
		t.Fatal(err)
	}
	if len(favs) != 1 || favs[0].MessageID != viva {
		t.Fatalf("favoritos = %+v, quer só a sem prazo", favs)
	}
	if _, err := repo.FindFavorite(s.ctx, ana, vencida); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("FindFavorite(vencida) = %v, quer ErrMessageNotFound", err)
	}
}

func TestRespostaAVencidaFicaSemPrevia(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	vencida, _ := parVencidaEViva(t, s, "original")
	resposta := uuid.NewString()
	if _, err := s.db.Exec(s.ctx, `INSERT INTO messages (id, author_id, conversation_id, reply_to_id, content) VALUES ($1, $2, $3, $4, 'resp')`,
		resposta, s.users["ana"], s.convID, vencida); err != nil {
		t.Fatal(err)
	}
	got, err := repo.FindByID(s.ctx, resposta)
	if err != nil {
		t.Fatal(err)
	}
	if got.ReplyTo != nil {
		t.Fatalf("a resposta mostrou a prévia da vencida: %+v", got.ReplyTo)
	}
}
