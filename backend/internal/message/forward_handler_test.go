package message

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

type permsByChannel map[string]int64

func (p permsByChannel) ChannelPerms(_ context.Context, channelID, _ string) (int64, error) {
	got, ok := p[channelID]
	if !ok {
		return 0, permission.ErrChannelNotFound
	}
	return got, nil
}

type fakeTargetDirectory struct {
	servers  []ForwardTargetServer
	channels map[string][]ForwardChannelCandidate
	err      error
}

func (d fakeTargetDirectory) UserServers(context.Context, string) ([]ForwardTargetServer, error) {
	return d.servers, d.err
}

func (d fakeTargetDirectory) ServerChannels(_ context.Context, serverID string) ([]ForwardChannelCandidate, error) {
	return d.channels[serverID], nil
}

func forwardRouter(env *forwardEnv, targets *ForwardTargets, userID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	ForwardRoutes(router.Group("/api"), NewForwardHandler(env.f, targets), func(c *gin.Context) {
		c.Set("userID", userID)
		c.Next()
	})
	return router
}

func postJSON(router *gin.Engine, path string, body any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestForwardHandlerDoCanalParaDM(t *testing.T) {
	env := newForwardEnv(t, sender, fakeAccess{}, authored(channelMsg("m1", "ana", "oi"), "ana", "Ana"))
	router := forwardRouter(env, nil, "bia")

	rec := postJSON(router, "/api/channels/geral/messages/m1/forward", map[string]string{"conversation_id": "dm1", "comment": "olha"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var got ForwardResult
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if got.Message == nil || got.Message.ForwardedFrom == nil || got.Message.ForwardedFrom.MessageID != "m1" || got.Comment == nil {
		t.Fatalf("resposta = %s", rec.Body)
	}
}

func TestForwardHandlerDaDMParaCanal(t *testing.T) {
	env := newForwardEnv(t, sender, fakeAccess{}, authored(convMsg("d1", "ana", "oi"), "ana", "Ana"))
	rec := postJSON(forwardRouter(env, nil, "bia"), "/api/conversations/dm1/messages/d1/forward", map[string]string{"channel_id": "geral"})
	if rec.Code != http.StatusCreated {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
}

func TestForwardHandlerErros(t *testing.T) {
	poll := authored(channelMsg("poll", "ana", "qual?"), "ana", "Ana")
	cases := []struct {
		name   string
		access RoomAccess
		body   any
		path   string
		want   int
	}{
		{"corpo inválido", fakeAccess{}, "x", "/api/channels/geral/messages/poll/forward", http.StatusBadRequest},
		{"sem destino", fakeAccess{}, map[string]string{}, "/api/channels/geral/messages/poll/forward", http.StatusBadRequest},
		{"enquete", fakeAccess{}, map[string]string{"conversation_id": "dm1"}, "/api/channels/geral/messages/poll/forward", http.StatusBadRequest},
		{"não existe", fakeAccess{}, map[string]string{"conversation_id": "dm1"}, "/api/channels/geral/messages/nada/forward", http.StatusNotFound},
		{"origem escondida", fakeAccess{readErr: ErrRoomNotFound}, map[string]string{"conversation_id": "dm1"}, "/api/channels/geral/messages/poll/forward", http.StatusNotFound},
		{"origem sem acesso", fakeAccess{readErr: ErrNoRoomAccess}, map[string]string{"conversation_id": "dm1"}, "/api/channels/geral/messages/poll/forward", http.StatusForbidden},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := newForwardEnv(t, sender, tc.access, poll)
			env.store.polls["poll"] = true
			if rec := postJSON(forwardRouter(env, nil, "bia"), tc.path, tc.body); rec.Code != tc.want {
				t.Fatalf("status %d, want %d: %s", rec.Code, tc.want, rec.Body)
			}
		})
	}
}

func TestRespondForwardErrorSemEspacoEDMBloqueada(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for err, want := range map[error]int{
		ErrForwardNoSpace:  http.StatusInsufficientStorage,
		ErrBlocked:         http.StatusForbidden,
		ErrContentTooLong:  http.StatusBadRequest,
		errors.New("caiu"): http.StatusInternalServerError,
	} {
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		respondForwardError(c, err)
		if rec.Code != want {
			t.Errorf("%v: status %d, want %d", err, rec.Code, want)
		}
	}
}

func TestForwardTargetsSoCanaisEmQuePodeEnviar(t *testing.T) {
	dir := fakeTargetDirectory{
		servers: []ForwardTargetServer{{ID: "s1", Name: "Salinha"}, {ID: "s2", Name: "Só leitura"}},
		channels: map[string][]ForwardChannelCandidate{
			"s1": {
				{ID: "geral", Name: "geral", Type: "text"}, {ID: "regras", Name: "regras", Type: "text"},
				{ID: "segredo", Name: "segredo", Type: "text"}, {ID: "voz", Name: "voz", Type: "voice"},
				{ID: "musica", Name: "musica", Type: "text", System: true},
			},
			"s2": {{ID: "avisos", Name: "avisos", Type: "text"}},
		},
	}
	perms := permsByChannel{
		"geral":  permission.ViewChannel | permission.SendMessages,
		"regras": permission.ViewChannel,
		"avisos": permission.ViewChannel,
		"voz":    permission.ViewChannel | permission.SendMessages,
		"musica": permission.ViewChannel | permission.SendMessages,
	}
	env := newForwardEnv(t, sender, fakeAccess{})
	router := forwardRouter(env, NewForwardTargets(dir, perms), "bia")

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/forward/targets", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	var got struct {
		Servers []ForwardTargetServer `json:"servers"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &got)
	if len(got.Servers) != 1 || got.Servers[0].ID != "s1" || len(got.Servers[0].Channels) != 1 || got.Servers[0].Channels[0].ID != "geral" {
		t.Fatalf("destinos = %+v", got.Servers)
	}
}

func TestForwardTargetsErroDoDiretorio(t *testing.T) {
	env := newForwardEnv(t, sender, fakeAccess{})
	router := forwardRouter(env, NewForwardTargets(fakeTargetDirectory{err: errors.New("caiu")}, permsByChannel{}), "bia")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/forward/targets", nil))
	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestForwardTargetsSemServidorDevolveListaVazia(t *testing.T) {
	got, err := NewForwardTargets(fakeTargetDirectory{}, permsByChannel{}).List(context.Background(), "bia")
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("got = %v, err = %v", got, err)
	}
}
