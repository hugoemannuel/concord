package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
	"gin-quickstart/backend/internal/bot"
	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// fakeSettings: um servidor em memória.
type fakeSettings struct {
	srv       Server
	updateErr error
	botErr    error
}

func (f *fakeSettings) FindByID(_ context.Context, id string) (*Server, error) {
	copy := f.srv
	return &copy, nil
}

func (f *fakeSettings) Update(_ context.Context, _ string, name string, iconURL *string) (*Server, error) {
	if f.updateErr != nil {
		return nil, f.updateErr
	}
	f.srv.Name = name
	if iconURL != nil {
		f.srv.IconURL = *iconURL
	}
	return f.FindByID(context.Background(), f.srv.ID)
}

func (f *fakeSettings) SetPrimaryChannel(_ context.Context, _ string, channelID string) (*Server, error) {
	if channelID == "voz" {
		return nil, ErrInvalidPrimaryChannel
	}
	if channelID == "quebra" {
		return nil, errors.New("banco fora")
	}
	f.srv.PrimaryChannelID = &channelID
	return f.FindByID(context.Background(), f.srv.ID)
}

func (f *fakeSettings) SetMusicBot(_ context.Context, _ string, actorID string, _ bool) error {
	if actorID != "dono" {
		return ErrOnlyOwnerBot
	}
	return f.botErr
}

type fakeRotator struct{ err error }

func (f fakeRotator) RotateInviteCode(context.Context, string) (string, error) {
	return "NOVO1234", f.err
}

// allowPerms: só "dono" e "mod" têm as permissões pedidas.
type allowPerms struct{}

func (allowPerms) Require(_ context.Context, _, userID string, _ int64) error {
	if userID == "dono" || userID == "mod" {
		return nil
	}
	if userID == "zeca" {
		return permission.ErrNotMember
	}
	return permission.ErrMissingPermission
}

func settingsRequest(t *testing.T, h *Handler, actor, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	auth := func(c *gin.Context) {
		if actor != "" {
			c.Set("userID", actor)
		}
		c.Next()
	}
	next := func(c *gin.Context) { c.Next() }
	ServerRoutes(router.Group("/api"), h, auth, next, next)
	req := httptest.NewRequest(method, "/api"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func settingsSetup() (*Handler, *fakeSettings, *audittest.Recorder) {
	f := &fakeSettings{srv: Server{ID: "s1", Name: "Turma", IconURL: "/a.png"}}
	log := &audittest.Recorder{}
	h := &Handler{perms: allowPerms{}, settings: f, codes: fakeRotator{}}
	h.SetAudit(log)
	return h, f, log
}

func TestSettingsUpdate(t *testing.T) {
	cases := []struct {
		name, actor, body string
		status            int
	}{
		{"json quebrado", "mod", `{"name":`, http.StatusBadRequest},
		{"sem login", "", `{"name":"x"}`, http.StatusUnauthorized},
		{"sem permissão", "ana", `{"name":"x"}`, http.StatusForbidden},
		{"não membro", "zeca", `{"name":"x"}`, http.StatusForbidden},
		{"ok", "mod", `{"name":"Turma 2"}`, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h, _, log := settingsSetup()
			w := settingsRequest(t, h, tc.actor, http.MethodPut, "/servers/s1", tc.body)
			if w.Code != tc.status {
				t.Fatalf("status = %d (%s), want %d", w.Code, w.Body.String(), tc.status)
			}
			if got := len(log.Events()); (got == 1) != (tc.status == http.StatusOK) {
				t.Fatalf("eventos = %d", got)
			}
		})
	}

	h, f, log := settingsSetup()
	settingsRequest(t, h, "mod", http.MethodPut, "/servers/s1", `{"name":"Turma 2","icon_url":"/b.png"}`)
	want := audit.Event{ServerID: "s1", ActorID: "mod", Action: audit.ServerUpdate, TargetType: audit.TargetServer, TargetID: "s1", TargetName: "Turma 2",
		Changes: []audit.Change{{Field: "name", Before: "Turma", After: "Turma 2"}, {Field: "icon", Before: "/a.png", After: "/b.png"}}}
	if e, _ := log.Last(); !reflect.DeepEqual(e, want) {
		t.Fatalf("editar:\n got %+v\nwant %+v", e, want)
	}

	// Mesmo nome: não grava. Erro do service: 400 e não grava.
	settingsRequest(t, h, "mod", http.MethodPut, "/servers/s1", `{"name":"Turma 2"}`)
	f.updateErr = errors.New("name is required")
	if w := settingsRequest(t, h, "mod", http.MethodPut, "/servers/s1", `{"name":""}`); w.Code != http.StatusBadRequest {
		t.Fatalf("erro do service: %d", w.Code)
	}
	if got := len(log.Events()); got != 1 {
		t.Fatalf("eventos = %d, want 1", got)
	}
}

func TestSettingsPrimaryChannel(t *testing.T) {
	cases := []struct {
		name, actor, body string
		status            int
	}{
		{"sem canal", "mod", `{}`, http.StatusBadRequest},
		{"sem login", "", `{"channel_id":"geral"}`, http.StatusUnauthorized},
		{"sem permissão", "ana", `{"channel_id":"geral"}`, http.StatusForbidden},
		{"canal de voz", "mod", `{"channel_id":"voz"}`, http.StatusBadRequest},
		{"banco fora", "mod", `{"channel_id":"quebra"}`, http.StatusInternalServerError},
		{"ok", "mod", `{"channel_id":"geral"}`, http.StatusOK},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h, _, log := settingsSetup()
			w := settingsRequest(t, h, tc.actor, http.MethodPut, "/servers/s1/primary-channel", tc.body)
			if w.Code != tc.status {
				t.Fatalf("status = %d (%s), want %d", w.Code, w.Body.String(), tc.status)
			}
			if got := len(log.Events()); (got == 1) != (tc.status == http.StatusOK) {
				t.Fatalf("eventos = %d", got)
			}
		})
	}

	h, _, log := settingsSetup()
	settingsRequest(t, h, "mod", http.MethodPut, "/servers/s1/primary-channel", `{"channel_id":"geral"}`)
	e, _ := log.Last()
	if e.ChannelID != "geral" || !reflect.DeepEqual(e.Changes, []audit.Change{{Field: "primary_channel", After: "geral"}}) {
		t.Fatalf("canal principal: %+v", e)
	}
	settingsRequest(t, h, "mod", http.MethodPut, "/servers/s1/primary-channel", `{"channel_id":"geral"}`)
	if got := len(log.Events()); got != 1 {
		t.Fatalf("mesmo canal gravou de novo: %d", got)
	}
}

func TestSettingsMusicBot(t *testing.T) {
	h, f, log := settingsSetup()
	if w := settingsRequest(t, h, "", http.MethodDelete, "/servers/s1/music-bot", ""); w.Code != http.StatusUnauthorized {
		t.Fatalf("sem login: %d", w.Code)
	}
	if w := settingsRequest(t, h, "mod", http.MethodDelete, "/servers/s1/music-bot", ""); w.Code != http.StatusForbidden {
		t.Fatalf("não dono: %d", w.Code)
	}
	if w := settingsRequest(t, h, "dono", http.MethodDelete, "/servers/s1/music-bot", ""); w.Code != http.StatusNoContent {
		t.Fatalf("remover: %d", w.Code)
	}
	if w := settingsRequest(t, h, "dono", http.MethodPost, "/servers/s1/music-bot", ""); w.Code != http.StatusNoContent {
		t.Fatalf("readicionar: %d", w.Code)
	}
	f.botErr = errors.New("server not found")
	if w := settingsRequest(t, h, "dono", http.MethodPost, "/servers/s1/music-bot", ""); w.Code != http.StatusNotFound {
		t.Fatalf("servidor sumiu: %d", w.Code)
	}
	got := log.Events()
	if len(got) != 2 || got[0].Action != audit.BotRemove || got[1].Action != audit.BotAdd || got[0].TargetID != bot.UserID || got[0].TargetType != audit.TargetMember {
		t.Fatalf("eventos = %+v", got)
	}
}

func TestSettingsRotateInviteCode(t *testing.T) {
	h, _, log := settingsSetup()
	if w := settingsRequest(t, h, "mod", http.MethodPost, "/servers/s1/invite-code/reset", ""); w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	want := audit.Event{ServerID: "s1", ActorID: "mod", Action: audit.InviteReset, TargetType: audit.TargetInvite}
	if e, _ := log.Last(); !reflect.DeepEqual(e, want) {
		t.Fatalf("evento = %+v", e)
	}
	h.codes = fakeRotator{err: errors.New("banco fora")}
	if w := settingsRequest(t, h, "mod", http.MethodPost, "/servers/s1/invite-code/reset", ""); w.Code != http.StatusInternalServerError {
		t.Fatalf("erro: %d", w.Code)
	}
	if got := len(log.Events()); got != 1 {
		t.Fatalf("falha gravou: %d", got)
	}
}

func TestRecordIcon(t *testing.T) {
	h, _, log := settingsSetup()
	old := "/a.png"
	h.recordIcon(context.Background(), "mod", &Server{ID: "s1", Name: "Turma", IconURL: "/b.png"}, &old)
	h.recordIcon(context.Background(), "mod", &Server{ID: "s1", Name: "Turma"}, nil) // sem ícone antes nem depois
	h.recordIcon(context.Background(), "mod", &Server{ID: "s1", Name: "Turma"}, &old)
	got := log.Events()
	want := [][]audit.Change{
		{{Field: "icon", Before: "/a.png", After: "/b.png"}},
		{{Field: "icon", Before: "/a.png", After: ""}},
	}
	if len(got) != 2 || !reflect.DeepEqual(got[0].Changes, want[0]) || !reflect.DeepEqual(got[1].Changes, want[1]) {
		t.Fatalf("eventos = %+v", got)
	}
}
