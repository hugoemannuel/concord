package call

import (
	"context"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
	"gin-quickstart/backend/internal/channel"

	"github.com/gin-gonic/gin"
)

// fakeModerator: "bia" está na call c1 (canal sala1 do servidor s1).
type fakeModerator struct {
	err error
}

func (f *fakeModerator) SetServerMute(_ context.Context, _, _, _ string, _ bool) error { return f.err }
func (f *fakeModerator) SetServerDeafen(_ context.Context, _, _, _ string, _ bool) error {
	return f.err
}
func (f *fakeModerator) DisconnectParticipant(_ context.Context, _, _, _ string) error { return f.err }
func (f *fakeModerator) MoveToChannel(_ context.Context, _, _, channelID string) (*Call, error) {
	if f.err != nil {
		return nil, f.err
	}
	server := "s1"
	return &Call{ID: "c2", ChannelID: &channelID, ServerID: &server}, nil
}
func (f *fakeModerator) VoiceLocationOf(userID string) (VoiceLocation, bool) {
	if userID != "bia" {
		return VoiceLocation{}, false
	}
	return VoiceLocation{CallID: "c1", ChannelID: "sala1", ServerID: "s1"}, true
}

type fakeChannelNames struct{}

func (fakeChannelNames) FindByID(_ context.Context, id string) (*channel.Channel, error) {
	names := map[string]string{"sala1": "Sala 1", "sala2": "Sala 2"}
	if name, ok := names[id]; ok {
		return &channel.Channel{ID: id, Name: name}, nil
	}
	return nil, channel.ErrChannelNotFound
}

func moderationRequest(t *testing.T, mod *fakeModerator, log *audittest.Recorder, actor, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	h := &Handler{moderator: mod}
	h.SetAudit(log, fakeChannelNames{})
	router := gin.New()
	auth := func(c *gin.Context) {
		if actor != "" {
			c.Set("userID", actor)
		}
		c.Next()
	}
	g := router.Group("/api/calls", auth)
	g.POST("/move", h.Move)
	g.POST("/:id/participants/:userId/server-mute", h.ServerMute)
	g.POST("/:id/participants/:userId/server-deafen", h.ServerDeafen)
	g.DELETE("/:id/participants/:userId", h.Disconnect)
	req := httptest.NewRequest(method, "/api/calls"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func TestModerationHandlersAudit(t *testing.T) {
	voice := func(action audit.Action, channelID string, changes ...audit.Change) audit.Event {
		return audit.Event{ServerID: "s1", ActorID: "mod", Action: action, TargetType: audit.TargetMember, TargetID: "bia", ChannelID: channelID, Changes: changes}
	}
	cases := []struct {
		name, method, path, body string
		want                     audit.Event
	}{
		{"silenciar", http.MethodPost, "/c1/participants/bia/server-mute", `{"muted":true}`,
			voice(audit.VoiceMute, "sala1", audit.Change{Field: "mute", After: true})},
		{"liberar a voz", http.MethodPost, "/c1/participants/bia/server-mute", `{"muted":false}`,
			voice(audit.VoiceMute, "sala1", audit.Change{Field: "mute", After: false})},
		{"ensurdecer", http.MethodPost, "/c1/participants/bia/server-deafen", `{"deafened":true}`,
			voice(audit.VoiceDeafen, "sala1", audit.Change{Field: "deaf", After: true})},
		{"desconectar", http.MethodDelete, "/c1/participants/bia", "",
			voice(audit.VoiceDisconnect, "sala1")},
		{"mover", http.MethodPost, "/move", `{"user_id":"bia","channel_id":"sala2"}`,
			voice(audit.VoiceMove, "sala2", audit.Change{Field: "channel", Before: "Sala 1", After: "Sala 2"})},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			log := &audittest.Recorder{}
			w := moderationRequest(t, &fakeModerator{}, log, "mod", tc.method, tc.path, tc.body)
			if w.Code != http.StatusOK {
				t.Fatalf("status = %d (%s)", w.Code, w.Body.String())
			}
			if got := log.Events(); len(got) != 1 || !reflect.DeepEqual(got[0], tc.want) {
				t.Fatalf("eventos:\n got %+v\nwant %+v", got, tc.want)
			}
		})
	}
}

func TestModerationHandlersErros(t *testing.T) {
	cases := []struct {
		name, actor, method, path, body string
		err                             error
		status                          int
	}{
		{"mover sem corpo", "mod", http.MethodPost, "/move", `{}`, nil, http.StatusBadRequest},
		{"mover sem login", "", http.MethodPost, "/move", `{"user_id":"bia","channel_id":"sala2"}`, nil, http.StatusUnauthorized},
		{"mover sem permissão", "mod", http.MethodPost, "/move", `{"user_id":"bia","channel_id":"sala2"}`, ErrNotModerator, http.StatusForbidden},
		{"mover para texto", "mod", http.MethodPost, "/move", `{"user_id":"bia","channel_id":"sala2"}`, ErrNotVoiceChannel, http.StatusBadRequest},
		{"mover call sumiu", "mod", http.MethodPost, "/move", `{"user_id":"bia","channel_id":"sala2"}`, ErrNotFound, http.StatusNotFound},
		{"silenciar sem corpo", "mod", http.MethodPost, "/c1/participants/bia/server-mute", `{}`, nil, http.StatusBadRequest},
		{"silenciar sem login", "", http.MethodPost, "/c1/participants/bia/server-mute", `{"muted":true}`, nil, http.StatusUnauthorized},
		{"silenciar sem permissão", "mod", http.MethodPost, "/c1/participants/bia/server-mute", `{"muted":true}`, ErrMissingPermission, http.StatusForbidden},
		{"ensurdecer acima", "mod", http.MethodPost, "/c1/participants/bia/server-deafen", `{"deafened":true}`, ErrCannotActOnMember, http.StatusForbidden},
		{"desconectar sem login", "", http.MethodDelete, "/c1/participants/bia", "", nil, http.StatusUnauthorized},
		{"desconectar fora da call", "mod", http.MethodDelete, "/c1/participants/bia", "", ErrTargetNotInCall, http.StatusNotFound},
		{"desconectar não membro", "mod", http.MethodDelete, "/c1/participants/bia", "", ErrNotMember, http.StatusForbidden},
		{"desconectar em DM", "mod", http.MethodDelete, "/c1/participants/bia", "", ErrNotChannelCall, http.StatusBadRequest},
		{"desconectar falha", "mod", http.MethodDelete, "/c1/participants/bia", "", ErrBusy, http.StatusInternalServerError},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			log := &audittest.Recorder{}
			w := moderationRequest(t, &fakeModerator{err: tc.err}, log, tc.actor, tc.method, tc.path, tc.body)
			if w.Code != tc.status {
				t.Fatalf("status = %d (%s), want %d", w.Code, w.Body.String(), tc.status)
			}
			if got := log.Events(); len(got) != 0 {
				t.Fatalf("ação que falhou foi registrada: %+v", got)
			}
		})
	}
}

// Alvo que não está (mais) em canal de voz deste servidor: a ação vale, mas
// sem lugar não há o que registrar.
func TestModerationAuditSemLocal(t *testing.T) {
	log := &audittest.Recorder{}
	if w := moderationRequest(t, &fakeModerator{}, log, "mod", http.MethodPost, "/c9/participants/bia/server-mute", `{"muted":true}`); w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if w := moderationRequest(t, &fakeModerator{}, log, "mod", http.MethodPost, "/c1/participants/zeca/server-mute", `{"muted":true}`); w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	if got := log.Events(); len(got) != 0 {
		t.Fatalf("eventos = %+v", got)
	}
}
