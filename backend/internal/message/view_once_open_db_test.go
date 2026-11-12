package message

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

type fakeViewOnceTokens struct{ err error }

func (f fakeViewOnceTokens) GenerateViewOnceToken(userID, attachmentID string) (string, time.Time, error) {
	if f.err != nil {
		return "", time.Time{}, f.err
	}
	return "vo:" + attachmentID + ":" + userID, time.Now().Add(5 * time.Minute), nil
}

// lockedFiles: o FileRemover dos testes de abertura (pode ser chamado de
// goroutines diferentes).
type lockedFiles struct {
	mu      sync.Mutex
	removed []string
}

func (f *lockedFiles) Remove(id string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.removed = append(f.removed, id)
	return nil
}

type lockedPublisher struct {
	pinTestPublisher
	mu      sync.Mutex
	updates []UpdateEvent
}

func (p *lockedPublisher) PublishMessageUpdate(e UpdateEvent) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.updates = append(p.updates, e)
}

// enviarViewOnce: a ana manda uma foto de visualização única na conversa,
// que só os recipients podem abrir. Devolve a mensagem e o anexo.
func enviarViewOnce(t *testing.T, s *searchDB, repo *Repository, recipients ...string) (string, string) {
	t.Helper()
	ana := s.users["ana"]
	att := anexoPendente(t, s, repo, ana, "image")
	if err := repo.MarkViewOnce(s.ctx, att, ana, s.convID, recipients); err != nil {
		t.Fatal(err)
	}
	conv := s.convID
	msg := &Message{ID: uuid.NewString(), AuthorID: ana, ConversationID: &conv}
	if err := repo.CreateWithAttachments(s.ctx, msg, []string{att}); err != nil {
		t.Fatal(err)
	}
	return msg.ID, att
}

type openEnv struct {
	svc   *ViewOnceService
	files *lockedFiles
	pub   *lockedPublisher
}

func newOpenEnv(s *searchDB, repo *Repository, access RoomAccess) *openEnv {
	env := &openEnv{files: &lockedFiles{}, pub: &lockedPublisher{}}
	ids := []string{s.users["ana"], s.users["bia"], s.users["caio"]}
	env.svc = NewViewOnceService(repo, fakeViewOnceRooms{ids: ids})
	env.svc.SetOpen(ViewOnceOpenDeps{Repo: repo, Access: access, Tokens: fakeViewOnceTokens{}, Files: env.files, Publisher: env.pub})
	return env
}

func carregar(t *testing.T, s *searchDB, repo *Repository, id string) Message {
	t.Helper()
	m, err := repo.FindByID(s.ctx, id)
	if err != nil {
		t.Fatal(err)
	}
	page := []Message{*m}
	if err := repo.AttachAttachments(s.ctx, page); err != nil {
		t.Fatal(err)
	}
	return page[0]
}

// Foco de revisão 4: app antigo não acha o anexo em attachments.
func TestListaTiraViewOnceDeAttachments(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	msgID, att := enviarViewOnce(t, s, repo, s.users["caio"])

	got := carregar(t, s, repo, msgID)
	if len(got.Attachments) != 0 {
		t.Fatalf("attachments = %+v", got.Attachments)
	}
	vo := got.ViewOnce
	if vo == nil || vo.ID != att || vo.Kind != "image" || vo.Gone || vo.RecipientCount != 1 || len(vo.ViewerIDs) != 0 {
		t.Fatalf("view_once = %+v", vo)
	}
	raw, _ := json.Marshal(got)
	if strings.Contains(string(raw), `"attachments"`) || !strings.Contains(string(raw), `"viewer_ids":[]`) {
		t.Fatalf("json = %s", raw)
	}
}

func TestOpenAutorDa403(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})
	if _, _, err := env.svc.Open(s.ctx, att, s.users["ana"]); !errors.Is(err, ErrViewOnceForbidden) {
		t.Fatalf("err = %v", err)
	}
}

// Foco de revisão 5: quem não estava na conversa no envio não abre, mesmo lendo a sala.
func TestOpenQuemEntrouDepoisDa403(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})
	if _, _, err := env.svc.Open(s.ctx, att, s.users["bia"]); !errors.Is(err, ErrViewOnceForbidden) {
		t.Fatalf("err = %v", err)
	}
	var n int
	s.db.QueryRow(s.ctx, `SELECT count(*) FROM attachment_views WHERE attachment_id = $1`, att).Scan(&n)
	if n != 0 {
		t.Fatalf("visualizações = %d", n)
	}
}

func TestOpenSemAcessoASalaNaoAbre(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{readErr: ErrNoRoomAccess})
	if _, _, err := env.svc.Open(s.ctx, att, s.users["caio"]); !errors.Is(err, ErrNoRoomAccess) {
		t.Fatalf("err = %v", err)
	}
}

func TestOpenAnexoComumOuPendenteNaoAcha(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	env := newOpenEnv(s, repo, fakeAccess{})
	comum := anexoPendente(t, s, repo, s.users["ana"], "image")
	for _, id := range []string{comum, uuid.NewString(), "nao-e-uuid"} {
		if _, _, err := env.svc.Open(s.ctx, id, s.users["caio"]); !errors.Is(err, ErrAttachmentNotFound) {
			t.Errorf("%s: err = %v", id, err)
		}
	}
}

func TestOpenSegundaVezDa410(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["bia"], s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})
	token, exp, err := env.svc.Open(s.ctx, att, s.users["caio"])
	if err != nil || token == "" || exp.IsZero() {
		t.Fatalf("token=%q exp=%v err=%v", token, exp, err)
	}
	if _, _, err := env.svc.Open(s.ctx, att, s.users["caio"]); !errors.Is(err, ErrViewOnceGone) {
		t.Fatalf("err = %v", err)
	}
}

// Erro ao gerar o token não gasta a visualização.
func TestOpenFalhaNoTokenNaoGastaVisualizacao(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})
	env.svc.open.Tokens = fakeViewOnceTokens{err: errors.New("jwt")}
	if _, _, err := env.svc.Open(s.ctx, att, s.users["caio"]); err == nil {
		t.Fatal("esperava erro")
	}
	env.svc.open.Tokens = fakeViewOnceTokens{}
	if _, _, err := env.svc.Open(s.ctx, att, s.users["caio"]); err != nil {
		t.Fatalf("err = %v", err)
	}
}

// Foco de revisão 2: duas aberturas ao mesmo tempo, só uma ganha o token.
func TestOpenConcorrenteSoUmGanha(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	_, att := enviarViewOnce(t, s, repo, s.users["caio"])
	env := newOpenEnv(s, repo, fakeAccess{})

	var wg sync.WaitGroup
	errs := make([]error, 2)
	tokens := make([]string, 2)
	for i := range 2 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			tokens[i], _, errs[i] = env.svc.Open(context.Background(), att, s.users["caio"])
		}()
	}
	wg.Wait()
	ok, gone := 0, 0
	for i, err := range errs {
		switch {
		case err == nil && tokens[i] != "":
			ok++
		case errors.Is(err, ErrViewOnceGone):
			gone++
		}
	}
	if ok != 1 || gone != 1 {
		t.Fatalf("tokens=%v errs=%v", tokens, errs)
	}
	if len(env.files.removed) != 1 || len(env.pub.updates) != 1 {
		t.Fatalf("removidos=%v updates=%d", env.files.removed, len(env.pub.updates))
	}
}

func TestOpenUltimoDestinatarioApagaArquivoEPublica(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	bia, caio := s.users["bia"], s.users["caio"]
	msgID, att := enviarViewOnce(t, s, repo, bia, caio)
	env := newOpenEnv(s, repo, fakeAccess{})

	if _, _, err := env.svc.Open(s.ctx, att, bia); err != nil {
		t.Fatal(err)
	}
	if len(env.files.removed) != 0 {
		t.Fatalf("apagou cedo: %v", env.files.removed)
	}
	if len(env.pub.updates) != 1 || len(env.pub.updates[0].Message.ViewOnce.ViewerIDs) != 1 {
		t.Fatalf("updates = %+v", env.pub.updates)
	}
	if _, _, err := env.svc.Open(s.ctx, att, caio); err != nil {
		t.Fatal(err)
	}
	if len(env.files.removed) != 1 || env.files.removed[0] != att {
		t.Fatalf("removidos = %v", env.files.removed)
	}
	last := env.pub.updates[len(env.pub.updates)-1]
	vo := last.Message.ViewOnce
	if last.Message.ID != msgID || last.ConversationID == nil || *last.ConversationID != s.convID || len(last.UserIDs) != 3 {
		t.Fatalf("update = %+v", last)
	}
	if vo == nil || !vo.Gone || len(vo.ViewerIDs) != 2 || vo.RecipientCount != 2 {
		t.Fatalf("view_once = %+v", vo)
	}
	if got := carregar(t, s, repo, msgID); got.ViewOnce == nil || !got.ViewOnce.Gone {
		t.Fatalf("relida = %+v", got.ViewOnce)
	}
}

// Dois "últimos" correndo: só um marca gone (e só um apaga o arquivo).
func TestMarcarGoneSoUmaVez(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	_, att := enviarViewOnce(t, s, repo, caio)
	if ok, err := repo.MarkViewOnceGoneIfAllViewed(s.ctx, att); err != nil || ok {
		t.Fatalf("sem visualização: ok=%v err=%v", ok, err)
	}
	if ok, err := repo.GrantView(s.ctx, att, caio); err != nil || !ok {
		t.Fatalf("grant: ok=%v err=%v", ok, err)
	}
	if ok, err := repo.MarkViewOnceGoneIfAllViewed(s.ctx, att); err != nil || !ok {
		t.Fatalf("primeira: ok=%v err=%v", ok, err)
	}
	if ok, err := repo.MarkViewOnceGoneIfAllViewed(s.ctx, att); err != nil || ok {
		t.Fatalf("segunda: ok=%v err=%v", ok, err)
	}
}

// Já apagada (14 dias): não dá mais para gravar visualização.
func TestGrantViewDepoisDeGoneNaoGrava(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	_, att := enviarViewOnce(t, s, repo, caio)
	if _, err := s.db.Exec(s.ctx, `UPDATE message_attachments SET view_once_gone_at = now() WHERE id = $1`, att); err != nil {
		t.Fatal(err)
	}
	if ok, err := repo.GrantView(s.ctx, att, caio); err != nil || ok {
		t.Fatalf("ok=%v err=%v", ok, err)
	}
	a, err := repo.FindAttachment(s.ctx, att)
	if err != nil || !a.ViewOnce || !a.ViewOnceGone {
		t.Fatalf("a=%+v err=%v", a, err)
	}
	env := newOpenEnv(s, repo, fakeAccess{})
	if _, _, err := env.svc.Open(s.ctx, att, caio); !errors.Is(err, ErrViewOnceGone) {
		t.Fatalf("err = %v", err)
	}
}
