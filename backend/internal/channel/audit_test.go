package channel

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

func auditRequest(t *testing.T, store *permStore, log *audittest.Recorder, userID, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	auth := func(c *gin.Context) {
		c.Set("userID", userID)
		c.Next()
	}
	h := ChannelHandler(newService(store, &permPublisher{}), store)
	h.SetAudit(log)
	ChannelRoutes(router.Group("/api"), h, auth)
	req := httptest.NewRequest(method, "/api"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestAuditChannelLifecycle(t *testing.T) {
	store, log := newPermStore(), &audittest.Recorder{}
	rec := auditRequest(t, store, log, "mod", http.MethodPost, "/servers/s1/channels", `{"name":"papo","type":"voice"}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("criar: %d %s", rec.Code, rec.Body.String())
	}
	created, _ := log.Last()
	if created.Action != audit.ChannelCreate || created.ActorID != "mod" || created.TargetType != audit.TargetChannel ||
		created.TargetName != "papo" || created.TargetID == "" ||
		!reflect.DeepEqual(created.Changes, []audit.Change{{Field: "name", After: "papo"}, {Field: "type", After: TypeVoice}}) {
		t.Fatalf("criar: %+v", created)
	}

	if rec := auditRequest(t, store, log, "mod", http.MethodPut, "/servers/s1/channels/geral", `{"name":"geral-2"}`); rec.Code != http.StatusOK {
		t.Fatalf("editar: %d", rec.Code)
	}
	e, _ := log.Last()
	want := audit.Event{ServerID: "s1", ActorID: "mod", Action: audit.ChannelUpdate, TargetType: audit.TargetChannel,
		TargetID: "geral", TargetName: "geral-2", Changes: []audit.Change{{Field: "name", Before: "geral", After: "geral-2"}}}
	if !reflect.DeepEqual(e, want) {
		t.Fatalf("editar:\n got %+v\nwant %+v", e, want)
	}

	if rec := auditRequest(t, store, log, "mod", http.MethodPut, "/servers/s1/channels/order", `{"type":"text","channel_ids":[]}`); rec.Code != http.StatusOK {
		t.Fatalf("reordenar: %d", rec.Code)
	}
	if e, _ := log.Last(); e.Action != audit.ChannelReorder || !reflect.DeepEqual(e.Changes, []audit.Change{{Field: "type", After: TypeText}}) {
		t.Fatalf("reordenar: %+v", e)
	}

	if rec := auditRequest(t, store, log, "mod", http.MethodDelete, "/servers/s1/channels/geral", ""); rec.Code != http.StatusOK {
		t.Fatalf("apagar: %d", rec.Code)
	}
	if e, _ := log.Last(); e.Action != audit.ChannelDelete || e.TargetID != "geral" || e.TargetName != "geral-2" {
		t.Fatalf("apagar: %+v", e)
	}
}

func TestAuditPrivateChannelCreate(t *testing.T) {
	store, log := newPermStore(), &audittest.Recorder{}
	rec := auditRequest(t, store, log, "dono", http.MethodPost, "/servers/s1/channels", `{"name":"vips","private":true,"role_ids":["vip"]}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("criar: %d", rec.Code)
	}
	e, _ := log.Last()
	want := []audit.Change{{Field: "name", After: "vips"}, {Field: "type", After: TypeText}, {Field: "private", After: true}}
	if !reflect.DeepEqual(e.Changes, want) {
		t.Fatalf("mudanças = %+v, want %+v", e.Changes, want)
	}
}

func TestAuditOverwrites(t *testing.T) {
	store, log := newPermStore(), &audittest.Recorder{}
	path := "/servers/s1/channels/segredo/overwrites/role/vip"
	body := `{"allow":` + strconv.FormatInt(permission.ViewChannel|permission.SendMessages, 10) + `,"deny":0}`
	if rec := auditRequest(t, store, log, "dono", http.MethodPut, path, body); rec.Code != http.StatusOK {
		t.Fatalf("permitir: %d %s", rec.Code, rec.Body.String())
	}
	e, _ := log.Last()
	want := audit.Event{ServerID: "s1", ActorID: "dono", Action: audit.ChannelOverwriteUpdate,
		TargetType: audit.TargetRole, TargetID: "vip", ChannelID: "segredo",
		Changes: []audit.Change{{Field: "allow", Before: permission.ViewChannel, After: permission.ViewChannel | permission.SendMessages}}}
	if !reflect.DeepEqual(e, want) {
		t.Fatalf("permitir:\n got %+v\nwant %+v", e, want)
	}

	// Gravar o mesmo de novo não suja o registro.
	n := len(log.Events())
	auditRequest(t, store, log, "dono", http.MethodPut, path, body)
	if len(log.Events()) != n {
		t.Fatalf("sobrescrita sem mudança gravou: %+v", log.Events())
	}

	if rec := auditRequest(t, store, log, "dono", http.MethodDelete, path, ""); rec.Code != http.StatusOK {
		t.Fatalf("apagar: %d", rec.Code)
	}
	e, _ = log.Last()
	if e.Action != audit.ChannelOverwriteDelete || e.ChannelID != "segredo" ||
		!reflect.DeepEqual(e.Changes, []audit.Change{{Field: "allow", Before: permission.ViewChannel | permission.SendMessages, After: int64(0)}}) {
		t.Fatalf("apagar: %+v", e)
	}
}

func TestAuditNadaQuandoRecusado(t *testing.T) {
	store, log := newPermStore(), &audittest.Recorder{}
	auditRequest(t, store, log, "ana", http.MethodPost, "/servers/s1/channels", `{"name":"x"}`)
	auditRequest(t, store, log, "ana", http.MethodDelete, "/servers/s1/channels/geral", "")
	auditRequest(t, store, log, "ana", http.MethodPut, "/servers/s1/channels/geral/overwrites/role/vip", `{"allow":1,"deny":0}`)
	if got := log.Events(); len(got) != 0 {
		t.Fatalf("ação recusada foi registrada: %+v", got)
	}
}
