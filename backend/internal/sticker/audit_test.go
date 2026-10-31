package sticker

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

func TestAuditStickerCriarEApagar(t *testing.T) {
	r, h, _, _ := buildStickerRouter(t)
	log := &audittest.Recorder{}
	h.SetAudit(log)

	req := makeMultipartReq(t, "/api/servers/srv-1/stickers", "doge", "image/png", validPNG)
	req.Header.Set("X-User", "ana")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	if w.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", w.Code, w.Body.String())
	}
	var created Sticker
	_ = json.Unmarshal(w.Body.Bytes(), &created)

	del := func(user string) int {
		req := httptest.NewRequest(http.MethodDelete, "/api/servers/srv-1/stickers/"+created.ID, nil)
		req.Header.Set("X-User", user)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}
	if code := del("bia"); code != http.StatusForbidden {
		t.Fatalf("bia apagando a da ana: %d", code)
	}
	if code := del("mod"); code != http.StatusOK {
		t.Fatalf("mod apagando: %d", code)
	}
	want := []audit.Event{
		{ServerID: "srv-1", ActorID: "ana", Action: audit.StickerCreate, TargetType: audit.TargetSticker, TargetID: created.ID, TargetName: "doge"},
		{ServerID: "srv-1", ActorID: "mod", Action: audit.StickerDelete, TargetType: audit.TargetSticker, TargetID: created.ID, TargetName: "doge"},
	}
	if got := log.Events(); !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}
}
