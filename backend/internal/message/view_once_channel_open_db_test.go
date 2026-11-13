package message

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Abrir e servir a visualização única num canal de servidor (S1): só os
// destinatários fixados no envio abrem, e só enquanto ainda veem o canal.

// enviarViewOnceNoCanal: a ana manda uma foto de visualização única no canal,
// que só os recipients podem abrir. Devolve a mensagem e o anexo.
func enviarViewOnceNoCanal(t *testing.T, s *searchDB, repo *Repository, channelID string, recipients ...string) (string, string) {
	t.Helper()
	ana := s.users["ana"]
	att := anexoPendenteNoCanal(t, s, repo, ana, channelID)
	if err := repo.MarkViewOnce(s.ctx, att, ana, Room{ChannelID: channelID}, recipients); err != nil {
		t.Fatal(err)
	}
	ch := channelID
	msg := &Message{ID: uuid.NewString(), AuthorID: ana, ChannelID: &ch}
	if err := repo.CreateWithAttachments(s.ctx, msg, []string{att}); err != nil {
		t.Fatal(err)
	}
	return msg.ID, att
}

// liberarNoCanal dá ao membro, por sobrescrita, as permissões no canal.
func liberarNoCanal(t *testing.T, s *searchDB, channelID, userID string, allow int64) {
	t.Helper()
	if _, err := s.db.Exec(s.ctx, `INSERT INTO channel_overwrites (channel_id, target_type, target_id, allow) VALUES ($1, 'member', $2, $3)`,
		channelID, userID, allow); err != nil {
		t.Fatal(err)
	}
}

type fixedServerOf string

func (f fixedServerOf) ChannelServerID(context.Context, string) (string, error) {
	return string(f), nil
}

// newChannelOpenEnv: a abertura com o acesso de verdade (permissões do banco,
// lidas agora: crie depois de mexer nas sobrescritas).
func newChannelOpenEnv(s *searchDB, repo *Repository) (*openEnv, *permission.Service) {
	perms := permission.PermissionService(permission.PermissionRepository(s.db))
	env := &openEnv{pub: &lockedPublisher{}}
	env.svc = NewViewOnceService(repo, nil)
	env.svc.SetOpen(ViewOnceOpenDeps{
		Repo:      repo,
		Access:    NewServiceRoomAccess(nil, perms, nil, nil),
		Tokens:    fakeViewOnceTokens{},
		Publisher: env.pub,
		Channels:  fixedServerOf(s.serverID),
	})
	return env, perms
}

// O destinatário abre (200 com o token) e a atualização sai pela sala do canal.
func TestOpenNoCanalDestinatarioAbrePublicaNoCanal(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	msgID, att := enviarViewOnceNoCanal(t, s, repo, s.geral, s.users["bia"], caio)
	env, _ := newChannelOpenEnv(s, repo)

	r := gin.New()
	ViewOnceRoutes(r.Group("/api"), NewViewOnceHandler(env.svc), func(c *gin.Context) { c.Set("userID", caio); c.Next() })
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/attachments/"+att+"/open", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body %s", rec.Code, rec.Body)
	}
	if len(env.pub.updates) != 1 {
		t.Fatalf("updates = %d", len(env.pub.updates))
	}
	up := env.pub.updates[0]
	if up.ChannelID == nil || *up.ChannelID != s.geral || up.ServerID != s.serverID || up.ConversationID != nil || len(up.UserIDs) != 0 {
		t.Fatalf("update = %+v", up)
	}
	vo := up.Message.ViewOnce
	if up.Message.ID != msgID || vo == nil || len(vo.ViewerIDs) != 1 || vo.ViewerIDs[0] != caio {
		t.Fatalf("mensagem = %+v", up.Message)
	}
}

// Foco de revisão 1: quem ganhou acesso ao canal depois do envio não abre.
func TestOpenNoCanalQuemGanhouOCargoDepoisDa403(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	_, att := enviarViewOnceNoCanal(t, s, repo, s.segredo, s.users["bia"])
	liberarNoCanal(t, s, s.segredo, caio, permission.ViewChannel|permission.ReadHistory)
	env, _ := newChannelOpenEnv(s, repo)
	if _, _, err := env.svc.Open(s.ctx, att, caio); !errors.Is(err, ErrViewOnceForbidden) {
		t.Fatalf("err = %v", err)
	}
}

// Foco de revisão 2: quem perdeu o acesso ao canal depois do envio é
// recusado pelo CanRead (404 no handler), sem gastar a visualização.
func TestOpenNoCanalQuemPerdeuOAcessoNaoAbre(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	_, att := enviarViewOnceNoCanal(t, s, repo, s.geral, s.users["bia"], caio)
	if _, err := s.db.Exec(s.ctx, `INSERT INTO channel_overwrites (channel_id, target_type, target_id, deny) VALUES ($1, 'member', $2, $3)`,
		s.geral, caio, permission.ViewChannel); err != nil {
		t.Fatal(err)
	}
	env, _ := newChannelOpenEnv(s, repo)
	_, _, err := env.svc.Open(s.ctx, att, caio)
	// Sem Ver canal o CanRead responde "sala não encontrada".
	if !errors.Is(err, ErrRoomNotFound) {
		t.Fatalf("err = %v", err)
	}
	if status, _ := openErrorStatus(err); status != http.StatusNotFound {
		t.Fatalf("status = %d", status)
	}
	var n int
	s.db.QueryRow(s.ctx, `SELECT count(*) FROM attachment_views WHERE attachment_id = $1`, att).Scan(&n)
	if n != 0 || len(env.pub.updates) != 0 {
		t.Fatalf("visualizações = %d, updates = %d", n, len(env.pub.updates))
	}
}

// Foco de revisão 3: moderador com Gerenciar mensagens que não é destinatário
// não abre (403), mas apaga a mensagem (200).
func TestOpenNoCanalModeradorNaoAbreMasApaga(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	msgID, att := enviarViewOnceNoCanal(t, s, repo, s.segredo, s.users["bia"])
	liberarNoCanal(t, s, s.segredo, caio, permission.ViewChannel|permission.ReadHistory|permission.ManageMessages)
	env, perms := newChannelOpenEnv(s, repo)
	if _, _, err := env.svc.Open(s.ctx, att, caio); !errors.Is(err, ErrViewOnceForbidden) {
		t.Fatalf("abrir: err = %v", err)
	}

	h := &Handler{service: MessageService(repo, &captureCreates{}, nil, nil, nil, perms), perms: perms}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	MessageRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", caio); c.Next() })
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/channels/"+s.segredo+"/messages/"+msgID, nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("apagar: status = %d body %s", rec.Code, rec.Body)
	}
	if _, err := repo.FindByID(s.ctx, msgID); err == nil {
		t.Fatal("a mensagem continua no banco")
	}
}

// mediaTokenOf: o token de mídia comum "bom" é do userID.
type mediaTokenOf struct {
	openTokens
	userID string
}

func (m mediaTokenOf) VerifyMediaToken(token string) (string, error) {
	if token == "bom" {
		return m.userID, nil
	}
	return "", errors.New("invalid token")
}

// O token aberto serve o arquivo do canal (200 e 206 com Range); o token de
// mídia comum do mesmo destinatário dá 404.
func TestServeFileNoCanalViewOnce(t *testing.T) {
	s := newSearchDB(t)
	repo := MessageRepository(s.db)
	caio := s.users["caio"]
	_, att := enviarViewOnceNoCanal(t, s, repo, s.geral, caio)
	env, perms := newChannelOpenEnv(s, repo)
	token, _, err := env.svc.Open(s.ctx, att, caio)
	if err != nil {
		t.Fatal(err)
	}

	store, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	data := pngBytes(64)
	if _, _, err := store.Save(att, bytes.NewReader(data), 1024); err != nil {
		t.Fatal(err)
	}
	gin.SetMode(gin.TestMode)
	router := gin.New()
	h := NewAttachmentHandler(repo, store, fakeSpace{ok: true}, NewServiceRoomAccess(nil, perms, nil, nil), mediaTokenOf{userID: caio})
	AttachmentRoutes(router.Group("/api"), h, func(c *gin.Context) {})
	get := func(tok, rangeHeader string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodGet, "/api/media/"+att+"?token="+tok, nil)
		if rangeHeader != "" {
			req.Header.Set("Range", rangeHeader)
		}
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	if rec := get(token, ""); rec.Code != http.StatusOK {
		t.Fatalf("sem Range: status = %d", rec.Code)
	}
	if rec := get(token, "bytes=0-3"); rec.Code != http.StatusPartialContent || !bytes.Equal(rec.Body.Bytes(), data[:4]) {
		t.Fatalf("Range: status = %d corpo %q", rec.Code, rec.Body.Bytes())
	}
	if rec := get("bom", ""); rec.Code != http.StatusNotFound {
		t.Fatalf("token de mídia: status = %d", rec.Code)
	}
}
