package websocket

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/auth"

	"github.com/gin-gonic/gin"
)

func newTicketAuth(t *testing.T) (*ConnectAuth, *auth.Service, versionsByUser, *[]string) {
	t.Helper()
	versions := versionsByUser{"u1": 0, "u2": 0}
	s := auth.NewService(nil, []byte("segredo-de-teste"))
	s.SetSessionVersions(auth.NewVersionCache(versions, time.Minute))
	a := NewConnectAuth(s)
	var logs []string
	a.logf = func(format string, args ...any) {
		logs = append(logs, format)
	}
	return a, s, versions, &logs
}

// issue pede POST /api/ws/ticket com o Bearer dado.
func issue(t *testing.T, a *ConnectAuth, bearer string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/ws/ticket", a.IssueTicket)
	req := httptest.NewRequest(http.MethodPost, "/api/ws/ticket", nil)
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func ticketFrom(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Ticket    string `json:"ticket"`
		ExpiresIn int    `json:"expires_in"`
	}
	if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &body) != nil || body.Ticket == "" {
		t.Fatalf("emissão: %d %s", w.Code, w.Body.String())
	}
	if body.ExpiresIn != int(TicketTTL/time.Second) {
		t.Fatalf("expires_in = %d", body.ExpiresIn)
	}
	return body.Ticket
}

func connectReq(q url.Values) *http.Request {
	return httptest.NewRequest(http.MethodGet, "/ws?"+q.Encode(), nil)
}

func TestEmiteTicketSoComBearerValido(t *testing.T) {
	a, s, _, _ := newTicketAuth(t)
	access, _ := s.GenerateAccessToken(context.Background(), "u1")
	guest, _ := s.GenerateGuestToken("g1", time.Now().Add(time.Hour))
	media, _, _ := s.GenerateMediaToken("u1")

	ticketFrom(t, issue(t, a, access))
	ticketFrom(t, issue(t, a, guest))
	for name, bearer := range map[string]string{"sem token": "", "mídia": media, "lixo": "lixo"} {
		if w := issue(t, a, bearer); w.Code != http.StatusUnauthorized {
			t.Errorf("%s: status %d, quer 401", name, w.Code)
		}
	}
}

func TestEmiteTicketRecusaSessaoRevogada(t *testing.T) {
	a, s, versions, _ := newTicketAuth(t)
	access, _ := s.GenerateAccessToken(context.Background(), "u1")
	versions["u1"] = 1
	s.ForgetSession("u1")
	w := issue(t, a, access)
	if w.Code != http.StatusUnauthorized || !strings.Contains(w.Body.String(), "session_revoked") {
		t.Fatalf("revogada: %d %s", w.Code, w.Body.String())
	}
}

func TestConectaComTicketUmaVez(t *testing.T) {
	a, s, _, _ := newTicketAuth(t)
	access, _ := s.GenerateAccessToken(context.Background(), "u1")
	ticket := ticketFrom(t, issue(t, a, access))

	user, ok := a.connectUser(context.Background(), connectReq(url.Values{"ticket": {ticket}}))
	if !ok || user != "u1" {
		t.Fatalf("primeira conexão = (%q, %v)", user, ok)
	}
	if _, ok := a.connectUser(context.Background(), connectReq(url.Values{"ticket": {ticket}})); ok {
		t.Fatal("ticket reaproveitado conectou")
	}
}

// Saiu de todos os dispositivos entre pedir o ticket e conectar: não entra.
func TestTicketDeSessaoRevogadaNaoConecta(t *testing.T) {
	a, s, versions, _ := newTicketAuth(t)
	access, _ := s.GenerateAccessToken(context.Background(), "u1")
	ticket := ticketFrom(t, issue(t, a, access))
	versions["u1"] = 1
	s.ForgetSession("u1")
	if _, ok := a.connectUser(context.Background(), connectReq(url.Values{"ticket": {ticket}})); ok {
		t.Fatal("ticket de sessão revogada conectou")
	}
}

// Cada ticket é de quem pediu: o de u2 conecta como u2, nunca como outra
// pessoa; ticket inválido não cai para o ?token= que veio junto.
func TestTicketDeOutroUsuario(t *testing.T) {
	a, s, _, _ := newTicketAuth(t)
	tokenU1, _ := s.GenerateAccessToken(context.Background(), "u1")
	tokenU2, _ := s.GenerateAccessToken(context.Background(), "u2")
	ticketU2 := ticketFrom(t, issue(t, a, tokenU2))

	user, ok := a.connectUser(context.Background(), connectReq(url.Values{"ticket": {ticketU2}, "token": {tokenU1}}))
	if !ok || user != "u2" {
		t.Fatalf("ticket de u2 = (%q, %v), quer u2", user, ok)
	}
	if _, ok := a.connectUser(context.Background(), connectReq(url.Values{"ticket": {"falso"}, "token": {tokenU1}})); ok {
		t.Fatal("ticket inválido caiu para o token")
	}
}

func TestTokenLegadoAindaConectaEContado(t *testing.T) {
	a, s, _, logs := newTicketAuth(t)
	access, _ := s.GenerateAccessToken(context.Background(), "u1")
	for i := 0; i < 2; i++ {
		user, ok := a.connectUser(context.Background(), connectReq(url.Values{"token": {access}}))
		if !ok || user != "u1" {
			t.Fatalf("token legado = (%q, %v)", user, ok)
		}
	}
	if a.LegacyCount() != 2 || len(*logs) != 2 {
		t.Fatalf("contagem = %d, logs = %d", a.LegacyCount(), len(*logs))
	}
	if _, ok := a.connectUser(context.Background(), connectReq(url.Values{})); ok {
		t.Fatal("sem credencial conectou")
	}
}

func TestClienteLegado(t *testing.T) {
	cases := []struct {
		query, ua, want string
	}{
		{"client=mobile", "okhttp/4.12.0", "mobile"},
		{"", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 salinha/0.5.9 Chrome/140 Electron/44.9.3 Safari/537.36", "salinha/0.5.9"},
		{"", "Mozilla/5.0 (Windows NT 10.0) Chrome/140 Safari/537.36", "navegador"},
	}
	for _, tc := range cases {
		q, _ := url.ParseQuery(tc.query)
		if got := legacyClient(q, tc.ua); got != tc.want {
			t.Errorf("legacyClient(%q, %q) = %q, quer %q", tc.query, tc.ua, got, tc.want)
		}
	}
}
