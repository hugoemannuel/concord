package soundboard

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

func TestAuditSomEnviarEApagar(t *testing.T) {
	r, h, _, _ := setupTestRouter(t)
	log := &audittest.Recorder{}
	h.SetAudit(log)

	w := postSound(t, r, "user-1")
	if w.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", w.Code, w.Body.String())
	}
	var created Sound
	_ = json.Unmarshal(w.Body.Bytes(), &created)

	del := func(user string) int {
		req := httptest.NewRequest(http.MethodDelete, "/api/servers/srv-1/soundboard/"+created.ID, nil)
		req.Header.Set("X-User-ID", user)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if code := del("user-2"); code != http.StatusForbidden {
		t.Fatalf("user-2 apagando: %d", code)
	}
	if code := del("mod-1"); code != http.StatusOK {
		t.Fatalf("mod apagando: %d", code)
	}
	want := []audit.Event{
		{ServerID: "srv-1", ActorID: "user-1", Action: audit.SoundCreate, TargetType: audit.TargetSound, TargetID: created.ID, TargetName: "Corneta"},
		{ServerID: "srv-1", ActorID: "mod-1", Action: audit.SoundDelete, TargetType: audit.TargetSound, TargetID: created.ID, TargetName: "Corneta"},
	}
	if got := log.Events(); !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}
}
