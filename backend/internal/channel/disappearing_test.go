package channel

import (
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
)

func TestValidChannelDisappearing(t *testing.T) {
	for _, s := range []int{0, 86400, 604800, 7776000} {
		if !ValidChannelDisappearing(s) {
			t.Errorf("%d deveria valer", s)
		}
	}
	for _, s := range []int{-1, 1, 3600, 86401, 15552000} {
		if ValidChannelDisappearing(s) {
			t.Errorf("%d não deveria valer", s)
		}
	}
}

func TestValidateRecusaPrazoForaDaLista(t *testing.T) {
	bad, ok := 3600, 604800
	if err := (UpdateInput{Name: "geral", DisappearingSeconds: &bad}).validate(); !errors.Is(err, ErrInvalidDisappearing) {
		t.Fatalf("3600: %v", err)
	}
	if err := (UpdateInput{Name: "geral", DisappearingSeconds: &ok}).validate(); err != nil {
		t.Fatalf("604800: %v", err)
	}
}

func TestUpdatePrazoForaDaListaE400(t *testing.T) {
	store := newPermStore()
	rec := auditRequest(t, store, &audittest.Recorder{}, "mod", http.MethodPut, "/servers/s1/channels/geral", `{"name":"geral","disappearing_seconds":3600}`)
	if rec.Code != http.StatusBadRequest || !strings.Contains(rec.Body.String(), `"code":"invalid_disappearing"`) {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	if store.channels["geral"].DisappearingSeconds != nil {
		t.Fatal("valor inválido foi gravado")
	}
}

func TestUpdatePrazoEVisualizacaoUnicaGravamEAuditam(t *testing.T) {
	store, log := newPermStore(), &audittest.Recorder{}
	rec := auditRequest(t, store, log, "mod", http.MethodPut, "/servers/s1/channels/geral", `{"name":"geral","disappearing_seconds":604800,"allow_view_once":false}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d %s", rec.Code, rec.Body)
	}
	var body Channel
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body.DisappearingSeconds == nil || *body.DisappearingSeconds != 604800 || body.AllowViewOnce {
		t.Fatalf("resposta %+v", body)
	}
	e, _ := log.Last()
	want := []audit.Change{
		{Field: "disappearing_seconds", Before: nil, After: 604800},
		{Field: "allow_view_once", Before: true, After: false},
	}
	if e.Action != audit.ChannelUpdate || !reflect.DeepEqual(e.Changes, want) {
		t.Fatalf("auditoria: %+v", e)
	}
}
