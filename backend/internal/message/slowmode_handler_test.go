package message

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// slowmodeRouter: as rotas de mensagem com o modo lento ligado em "lento"
// (30 s). O caminho bloqueado não chega no banco.
func slowmodeRouter(perms int64, gate *Slowmode) *gin.Engine {
	gin.SetMode(gin.TestMode)
	svc := &Service{publisher: &captureCreates{}, perms: allowAll{perms: perms}}
	svc.SetSlowmode(gate)
	h := &Handler{service: svc, perms: allowAll{perms: perms}}
	r := gin.New()
	MessageRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", "ana"); c.Next() })
	return r
}

func newGate() *Slowmode {
	return NewSlowmode(fakeSlowmodeChannels{"lento": 30, "ch1": 30}, permsByUser{"ana": membro})
}

func postRaw(r *gin.Engine, path, raw string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader([]byte(raw)))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func slowmodeBody(t *testing.T, rec *httptest.ResponseRecorder) (string, int) {
	t.Helper()
	var body struct {
		Code       string `json:"code"`
		RetryAfter int    `json:"retry_after"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return body.Code, body.RetryAfter
}

func TestCreateChannelMessageNoModoLentoE429(t *testing.T) {
	gate := newGate()
	_ = gate.Take(context.Background(), "lento", "ana")
	rec := postRaw(slowmodeRouter(membro, gate), "/api/channels/lento/messages", `{"content":"oi"}`)
	code, retry := slowmodeBody(t, rec)
	if rec.Code != http.StatusTooManyRequests || code != "slowmode" || retry != 30 {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
}

func TestCreateChannelMessageRecusasAntesDoModoLento(t *testing.T) {
	cases := []struct {
		name   string
		perms  int64
		raw    string
		status int
	}{
		{"JSON inválido", membro, `{`, http.StatusBadRequest},
		{"sem texto nem mídia", membro, `{"content":"  "}`, http.StatusBadRequest},
		{"sem Enviar mensagens", permission.ViewChannel, `{"content":"oi"}`, http.StatusForbidden},
		{"anexo sem Enviar arquivos", membro, `{"content":"oi","attachment_ids":["a1"]}`, http.StatusForbidden},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gate := newGate()
			rec := postRaw(slowmodeRouter(c.perms, gate), "/api/channels/lento/messages", c.raw)
			if rec.Code != c.status {
				t.Fatalf("status %d body %s; quero %d", rec.Code, rec.Body, c.status)
			}
			if _, ok := gate.last[slowmodeKey{"lento", "ana"}]; ok {
				t.Fatal("mensagem recusada gastou a vez")
			}
		})
	}
}

func TestCreateChannelMessageSemUsuario(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	MessageRoutes(r.Group("/api"), &Handler{service: &Service{}, perms: allowAll{perms: membro}}, func(c *gin.Context) { c.Next() })
	if rec := postRaw(r, "/api/channels/lento/messages", `{"content":"oi"}`); rec.Code != http.StatusUnauthorized {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestRespondCreateError(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{&SlowmodeError{RetryAfter: 1500 * time.Millisecond}, http.StatusTooManyRequests, "slowmode"},
		{ErrContentRequired, http.StatusBadRequest, ""},
	}
	for _, c := range cases {
		gin.SetMode(gin.TestMode)
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		respondCreateError(ctx, c.err)
		code, retry := slowmodeBody(t, rec)
		if rec.Code != c.status || code != c.code {
			t.Fatalf("%v: status %d body %s", c.err, rec.Code, rec.Body)
		}
		if c.code == "slowmode" && retry != 2 {
			t.Fatalf("retry_after arredonda para cima: %d", retry)
		}
	}
}

// O /tts do canal conta para o modo lento: com a vez gasta, é 429 slowmode e
// o cooldown do TTS volta.
func TestTTSNoModoLentoE429(t *testing.T) {
	gin.SetMode(gin.TestMode)
	svc, _, _ := ttsEnv(&fakeInviteStore{})
	gate := newGate()
	svc.SetSlowmode(gate)
	h := NewTTSHandler(svc, allowAll{perms: ttsAllowed}, fakeAccess{})
	r := gin.New()
	TTSRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Set("userID", "ana"); c.Next() })

	if rec := postTTS(r, "/api/channels/ch1/tts", "um"); rec.Code != http.StatusCreated {
		t.Fatalf("primeira: %d %s", rec.Code, rec.Body)
	}
	svc.cooldown.Release("ana")
	rec := postTTS(r, "/api/channels/ch1/tts", "dois")
	if code, _ := slowmodeBody(t, rec); rec.Code != http.StatusTooManyRequests || code != "slowmode" {
		t.Fatalf("status %d body %s", rec.Code, rec.Body)
	}
	if wait := svc.cooldown.Take("ana"); wait != 0 {
		t.Fatalf("o cooldown do TTS não voltou: %s", wait)
	}
}

// Mensagem que não sai (erro ao gravar) devolve a vez.
func TestTTSQueFalhaDevolveAVezDoModoLento(t *testing.T) {
	svc, _, _ := ttsEnv(&fakeInviteStore{err: errBoom})
	gate := newGate()
	svc.SetSlowmode(gate)
	if _, err := svc.SendToChannel(context.Background(), "ch1", "ana", "oi"); err == nil {
		t.Fatal("quero o erro do banco")
	}
	if _, ok := gate.last[slowmodeKey{"ch1", "ana"}]; ok {
		t.Fatal("a vez não voltou")
	}
}

var errBoom = &testErr{"boom"}

type testErr struct{ s string }

func (e *testErr) Error() string { return e.s }

func TestCreateMessageInputTextOnly(t *testing.T) {
	sticker := "s1"
	cases := []struct {
		in   createMessageInput
		want bool
	}{
		{createMessageInput{Content: "/play x"}, true},
		{createMessageInput{Content: "x", AttachmentIDs: []string{"a"}}, false},
		{createMessageInput{StickerID: &sticker}, false},
		{createMessageInput{GifURL: &sticker}, false},
	}
	for _, c := range cases {
		if got := c.in.textOnly(); got != c.want {
			t.Errorf("%+v: %v", c.in, got)
		}
	}
}
