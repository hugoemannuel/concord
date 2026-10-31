package emoji

import (
	"encoding/json"
	"net/http"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

func TestAuditEmojiCriarEApagar(t *testing.T) {
	e := newEnv(t)
	log := &audittest.Recorder{}
	e.h.SetAudit(log)

	w := e.upload(t, "ana", "festa", pngBytes)
	if w.Code != http.StatusCreated {
		t.Fatalf("upload: %d %s", w.Code, w.Body.String())
	}
	var created Emoji
	_ = json.Unmarshal(w.Body.Bytes(), &created)
	if w := e.do(http.MethodDelete, "/api/servers/srv-1/emojis/"+created.ID, "bia"); w.Code != http.StatusForbidden {
		t.Fatalf("bia apagando o da ana: %d", w.Code)
	}
	if w := e.do(http.MethodDelete, "/api/servers/srv-1/emojis/"+created.ID, "mod"); w.Code != http.StatusOK {
		t.Fatalf("mod apagando: %d", w.Code)
	}
	got := log.Events()
	want := []audit.Event{
		{ServerID: "srv-1", ActorID: "ana", Action: audit.EmojiCreate, TargetType: audit.TargetEmoji, TargetID: created.ID, TargetName: "festa"},
		{ServerID: "srv-1", ActorID: "mod", Action: audit.EmojiDelete, TargetType: audit.TargetEmoji, TargetID: created.ID, TargetName: "festa"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}
}
