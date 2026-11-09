package channel

import (
	"context"
	"encoding/json"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

func TestValidSlowmode(t *testing.T) {
	for _, s := range []int{0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600} {
		if !ValidSlowmode(s) {
			t.Errorf("%d deveria valer", s)
		}
	}
	for _, s := range []int{-5, 1, 7, 45, 21601, 86400} {
		if ValidSlowmode(s) {
			t.Errorf("%d não deveria valer", s)
		}
	}
}

func TestUpdateSlowmodeGravaEAudita(t *testing.T) {
	store, log := newPermStore(), &audittest.Recorder{}
	rec := auditRequest(t, store, log, "mod", http.MethodPut, "/servers/s1/channels/geral", `{"name":"geral","slowmode_seconds":30}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	var body Channel
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body.SlowmodeSeconds != 30 || store.channels["geral"].SlowmodeSeconds != 30 {
		t.Fatalf("resposta %d, gravado %d", body.SlowmodeSeconds, store.channels["geral"].SlowmodeSeconds)
	}
	e, _ := log.Last()
	want := []audit.Change{{Field: "slowmode_seconds", Before: 0, After: 30}}
	if e.Action != audit.ChannelUpdate || !reflect.DeepEqual(e.Changes, want) {
		t.Fatalf("auditoria: %+v", e)
	}
}

func TestUpdateSemSlowmodeMantemOValor(t *testing.T) {
	store := newPermStore()
	store.channels["geral"].SlowmodeSeconds = 60
	rec := auditRequest(t, store, &audittest.Recorder{}, "mod", http.MethodPut, "/servers/s1/channels/geral", `{"name":"novo"}`)
	if rec.Code != http.StatusOK || store.channels["geral"].SlowmodeSeconds != 60 || store.channels["geral"].Name != "novo" {
		t.Fatalf("status %d, canal %+v", rec.Code, store.channels["geral"])
	}
}

func TestUpdateSlowmodeForaDaListaE400(t *testing.T) {
	store := newPermStore()
	rec := auditRequest(t, store, &audittest.Recorder{}, "mod", http.MethodPut, "/servers/s1/channels/geral", `{"name":"geral","slowmode_seconds":7}`)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), `"code":"invalid_slowmode"`) {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if store.channels["geral"].SlowmodeSeconds != 0 {
		t.Fatal("valor inválido foi gravado")
	}
}

func TestUpdateSlowmodeExigeGerenciarCanais(t *testing.T) {
	rec := auditRequest(t, newPermStore(), &audittest.Recorder{}, "ana", http.MethodPut, "/servers/s1/channels/geral", `{"name":"geral","slowmode_seconds":30}`)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status %d", rec.Code)
	}
}

func TestOnUpdatedAvisaOCanalEditado(t *testing.T) {
	store := newSystemStore()
	svc := newService(store, nil)
	var got []string
	svc.OnUpdated(func(_ context.Context, ch *Channel) { got = append(got, ch.ID) })
	thirty := 30
	if _, err := svc.Update(context.Background(), "geral", UpdateInput{Name: "geral", SlowmodeSeconds: &thirty}); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Update(context.Background(), "musica", UpdateInput{Name: "x"}); err == nil {
		t.Fatal("canal de sistema editado")
	}
	if !reflect.DeepEqual(got, []string{"geral"}) {
		t.Fatalf("avisos = %v", got)
	}
}
