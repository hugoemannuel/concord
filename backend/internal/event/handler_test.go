package event

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type fakeService struct {
	roleSet     string
	roleActions Actions
	err         error
	created     Input
	going       *bool
	cleared     bool
}

func (f *fakeService) Create(_ context.Context, serverID, _ string, in Input) (*Event, error) {
	f.created = in
	if f.err != nil {
		return nil, f.err
	}
	return &Event{ID: "e1", ServerID: serverID, Title: in.Title}, nil
}

func (f *fakeService) Update(_ context.Context, serverID, eventID, _ string, in Input) (*Event, error) {
	if f.err != nil {
		return nil, f.err
	}
	return &Event{ID: eventID, ServerID: serverID, Title: in.Title}, nil
}

func (f *fakeService) Cancel(context.Context, string, string, string) error { return f.err }

func (f *fakeService) List(context.Context, string, string) ([]Event, error) {
	return []Event{{ID: "e1", Title: "Noite"}}, f.err
}

func (f *fakeService) SetRSVP(_ context.Context, _, _, _ string, going bool) error {
	f.going = &going
	return f.err
}

func (f *fakeService) ClearRSVP(context.Context, string, string, string) error {
	f.cleared = true
	return f.err
}

func (f *fakeService) Access(context.Context, string, string) (AccessView, error) {
	return AccessView{Create: true, Edit: true, Configure: true, Owner: true}, f.err
}

func (f *fakeService) RoleSettings(context.Context, string, string) ([]RoleAccess, error) {
	return []RoleAccess{{RoleID: "r1", Name: "Cargo A", Create: true}}, f.err
}

func (f *fakeService) SetRoleActions(_ context.Context, _, _, roleID string, a Actions) error {
	f.roleSet = roleID
	f.roleActions = a
	return f.err
}

func (f *fakeService) ListGoing(context.Context, string, string, string) ([]Going, error) {
	return []Going{{UserID: "u1"}}, f.err
}

func routerFor(svc eventService, userID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
		c.Next()
	}
	Routes(r.Group("/api"), NewHandler(svc), nil, auth)
	return r
}

func call(r *gin.Engine, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func errCode(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body map[string]string
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("corpo não é JSON: %s", w.Body.String())
	}
	return body["code"]
}

const eventBody = `{"title":"Noite","starts_at":"2026-12-01T20:00:00Z","duration_minutes":120,"recurrence":"weekly","reminder_offsets":[10,5]}`

func TestCreateReturns201WithTheEvent(t *testing.T) {
	svc := &fakeService{}
	w := call(routerFor(svc, "u1"), http.MethodPost, "/api/servers/s1/events", eventBody)
	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, corpo %s", w.Code, w.Body.String())
	}
	if svc.created.Title != "Noite" || svc.created.Recurrence != RecWeekly || len(svc.created.ReminderOffsets) != 2 {
		t.Errorf("entrada = %+v", svc.created)
	}
	if !svc.created.StartsAt.Equal(time.Date(2026, 12, 1, 20, 0, 0, 0, time.UTC)) {
		t.Errorf("starts_at = %v", svc.created.StartsAt)
	}
}

func TestCreateWithBadBodyIs400(t *testing.T) {
	w := call(routerFor(&fakeService{}, "u1"), http.MethodPost, "/api/servers/s1/events", `{`)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestWithoutUserIs401(t *testing.T) {
	w := call(routerFor(&fakeService{}, ""), http.MethodGet, "/api/servers/s1/events", "")
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestDomainErrorsBecomeStatusAndCode(t *testing.T) {
	cases := []struct {
		err    error
		status int
		code   string
	}{
		{ErrMissingPermission, http.StatusForbidden, "missing_permission"},
		{ErrNotMember, http.StatusForbidden, "not_member"},
		{ErrEventNotFound, http.StatusNotFound, "event_not_found"},
		{ErrEventEnded, http.StatusConflict, "event_ended"},
		{ErrInPast, http.StatusBadRequest, "event_in_past"},
		{ErrInvalidTitle, http.StatusBadRequest, "invalid_title"},
		{ErrInvalidDescription, http.StatusBadRequest, "invalid_description"},
		{ErrInvalidRecurrence, http.StatusBadRequest, "invalid_recurrence"},
		{ErrInvalidReminder, http.StatusBadRequest, "invalid_reminder"},
		{ErrTooManyReminders, http.StatusBadRequest, "too_many_reminders"},
		{ErrInvalidDuration, http.StatusBadRequest, "invalid_duration"},
		{ErrEventRunning, http.StatusConflict, "event_running"},
		{ErrInvalidBanner, http.StatusBadRequest, "invalid_banner"},
		{ErrRoleNotFound, http.StatusNotFound, "role_not_found"},
	}
	for _, c := range cases {
		status, code := errorResponse(c.err)
		if status != c.status || code != c.code {
			t.Errorf("%v → %d %q, esperava %d %q", c.err, status, code, c.status, c.code)
		}
	}
	if status, _ := errorResponse(errors.New("boom")); status != http.StatusInternalServerError {
		t.Errorf("erro desconhecido = %d", status)
	}
}

func TestMissingPermissionReachesTheClientWithCode(t *testing.T) {
	w := call(routerFor(&fakeService{err: ErrMissingPermission}, "u1"), http.MethodPost, "/api/servers/s1/events", eventBody)
	if w.Code != http.StatusForbidden || errCode(t, w) != "missing_permission" {
		t.Fatalf("status = %d, corpo %s", w.Code, w.Body.String())
	}
}

func TestRSVPEndpoints(t *testing.T) {
	svc := &fakeService{}
	r := routerFor(svc, "u1")
	if w := call(r, http.MethodPut, "/api/servers/s1/events/e1/rsvp", `{"going":true}`); w.Code != http.StatusNoContent {
		t.Fatalf("PUT status = %d", w.Code)
	}
	if svc.going == nil || !*svc.going {
		t.Error("o service devia receber going=true")
	}
	if w := call(r, http.MethodPut, "/api/servers/s1/events/e1/rsvp", `{}`); w.Code != http.StatusBadRequest {
		t.Errorf("PUT sem going = %d, esperava 400", w.Code)
	}
	if w := call(r, http.MethodDelete, "/api/servers/s1/events/e1/rsvp", ""); w.Code != http.StatusNoContent || !svc.cleared {
		t.Errorf("DELETE rsvp = %d cleared=%v", w.Code, svc.cleared)
	}
	if w := call(r, http.MethodGet, "/api/servers/s1/events/e1/rsvps", ""); w.Code != http.StatusOK {
		t.Errorf("GET rsvps = %d", w.Code)
	}
}

func TestListUpdateAndCancel(t *testing.T) {
	r := routerFor(&fakeService{}, "u1")
	if w := call(r, http.MethodGet, "/api/servers/s1/events", ""); w.Code != http.StatusOK {
		t.Errorf("GET = %d", w.Code)
	}
	if w := call(r, http.MethodPatch, "/api/servers/s1/events/e1", eventBody); w.Code != http.StatusOK {
		t.Errorf("PATCH = %d", w.Code)
	}
	if w := call(r, http.MethodDelete, "/api/servers/s1/events/e1", ""); w.Code != http.StatusNoContent {
		t.Errorf("DELETE = %d", w.Code)
	}
}

func TestAccessEndpointTellsWhatIMayDo(t *testing.T) {
	w := call(routerFor(&fakeService{}, "u1"), http.MethodGet, "/api/servers/s1/events/access", "")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d (%s)", w.Code, w.Body.String())
	}
	var got map[string]bool
	_ = json.Unmarshal(w.Body.Bytes(), &got)
	if !got["create"] || !got["edit"] || got["delete"] || !got["configure"] || !got["owner"] {
		t.Fatalf("corpo = %s", w.Body.String())
	}
}

func TestRoleSettingsEndpoints(t *testing.T) {
	svc := &fakeService{}
	r := routerFor(svc, "dono")
	w := call(r, http.MethodGet, "/api/servers/s1/events/roles", "")
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"role_id":"r1"`) {
		t.Fatalf("GET = %d %s", w.Code, w.Body.String())
	}
	w = call(r, http.MethodPut, "/api/servers/s1/events/roles/r1", `{"create":true,"edit":false,"delete":true,"configure":true}`)
	if w.Code != http.StatusNoContent || svc.roleSet != "r1" || svc.roleActions != ActionCreate|ActionDelete|ActionConfigure {
		t.Fatalf("PUT = %d, cargo %q ações %b", w.Code, svc.roleSet, svc.roleActions)
	}
	if w := call(r, http.MethodPut, "/api/servers/s1/events/roles/r1", `{`); w.Code != http.StatusBadRequest {
		t.Errorf("corpo inválido = %d", w.Code)
	}
}

func TestRoleSettingsRefusedWithoutPermission(t *testing.T) {
	r := routerFor(&fakeService{err: ErrMissingPermission}, "u1")
	if w := call(r, http.MethodGet, "/api/servers/s1/events/roles", ""); w.Code != http.StatusForbidden || errCode(t, w) != "missing_permission" {
		t.Errorf("GET = %d %s", w.Code, w.Body.String())
	}
	if w := call(r, http.MethodPut, "/api/servers/s1/events/roles/r1", `{"create":true}`); w.Code != http.StatusForbidden {
		t.Errorf("PUT = %d", w.Code)
	}
}
