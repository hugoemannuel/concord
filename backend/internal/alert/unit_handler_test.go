package alert

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

type fakeNotifier struct {
	events []Event
	err    error
}

func (f *fakeNotifier) Notify(_ context.Context, ev Event) error {
	f.events = append(f.events, ev)
	return f.err
}

func unitRequest(h *UnitHandler, remote string, headers map[string]string, unit string) int {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	UnitRoutes(r, h)
	req := httptest.NewRequest(http.MethodPost, UnitFailedPath, strings.NewReader(url.Values{"unit": {unit}}.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	req.RemoteAddr = remote
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code
}

func TestUnitHandlerSoDaPropriaMaquina(t *testing.T) {
	tests := []struct {
		name    string
		remote  string
		headers map[string]string
		want    int
	}{
		{"systemd local", "127.0.0.1:51000", nil, http.StatusNoContent},
		{"ipv6 local", "[::1]:51000", nil, http.StatusNoContent},
		{"de fora", "203.0.113.7:443", nil, http.StatusForbidden},
		{"pelo Caddy (X-Forwarded-For)", "127.0.0.1:51000", map[string]string{"X-Forwarded-For": "203.0.113.7"}, http.StatusForbidden},
		{"Forwarded", "127.0.0.1:51000", map[string]string{"Forwarded": "for=203.0.113.7"}, http.StatusForbidden},
		{"X-Real-IP", "127.0.0.1:51000", map[string]string{"X-Real-IP": "203.0.113.7"}, http.StatusForbidden},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			alerts := &fakeNotifier{}
			if got := unitRequest(NewUnitHandler(alerts), tt.remote, tt.headers, "concord-backup.service"); got != tt.want {
				t.Fatalf("status = %d, quer %d", got, tt.want)
			}
			if (len(alerts.events) == 1) != (tt.want == http.StatusNoContent) {
				t.Fatalf("eventos = %+v", alerts.events)
			}
		})
	}
}

func TestUnitHandlerNomeEDeduplicacao(t *testing.T) {
	alerts := &fakeNotifier{}
	h := NewUnitHandler(alerts)
	clock := at(3, 0)
	h.now = func() time.Time { return clock }
	for _, bad := range []string{"", "a b", "x;rm", `a\\b`, strings.Repeat("a", 200)} {
		if got := unitRequest(h, "127.0.0.1:1", nil, bad); got != http.StatusBadRequest {
			t.Errorf("%q: status %d", bad, got)
		}
	}
	unitRequest(h, "127.0.0.1:1", nil, "concord-backup.service")
	clock = clock.Add(10 * time.Minute)
	unitRequest(h, "127.0.0.1:1", nil, "concord-backup.service")
	clock = clock.Add(time.Hour)
	unitRequest(h, "127.0.0.1:1", nil, "concord-backup.service")
	if len(alerts.events) != 3 || alerts.events[0].Quiet || !alerts.events[1].Quiet || alerts.events[2].Quiet {
		t.Fatalf("eventos = %+v", alerts.events)
	}
	if alerts.events[0].Text != "Aviso: o serviço concord-backup.service falhou. Veja no servidor: journalctl -u concord-backup.service -n 50" {
		t.Errorf("texto = %q", alerts.events[0].Text)
	}
	alerts.err = errors.New("sem banco")
	if got := unitRequest(h, "127.0.0.1:1", nil, "salinha-firewall.service"); got != http.StatusInternalServerError {
		t.Errorf("falha ao avisar = %d", got)
	}
}

func TestEngineNotifyQuietSoGrava(t *testing.T) {
	f := newEngineFixture(t, Hold{})
	if err := f.engine.Notify(context.Background(), Event{RuleID: "unit_failed", Channel: ChannelInfra, Text: "x", Quiet: true}); err != nil {
		t.Fatal(err)
	}
	if len(f.store.rows) != 1 || len(f.sender.msgs) != 0 {
		t.Fatalf("incidentes %d, mensagens %d", len(f.store.rows), len(f.sender.msgs))
	}
}
