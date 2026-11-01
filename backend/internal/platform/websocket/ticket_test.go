package websocket

import (
	"errors"
	"testing"
	"time"

	"gin-quickstart/backend/internal/auth"
)

type fakeClock struct{ t time.Time }

func (c *fakeClock) now() time.Time { return c.t }

func newTestTickets() (*TicketStore, *fakeClock) {
	clock := &fakeClock{t: time.Date(2026, 11, 1, 12, 0, 0, 0, time.UTC)}
	s := NewTicketStore(TicketTTL)
	s.now = clock.now
	return s, clock
}

func TestTicketEmiteAleatorioEGuardaSoOHash(t *testing.T) {
	s, _ := newTestTickets()
	a, err := s.Issue(auth.Claims{UserID: "u1", Type: "access"})
	if err != nil {
		t.Fatalf("Issue: %v", err)
	}
	b, _ := s.Issue(auth.Claims{UserID: "u1", Type: "access"})
	if a == b || len(a) < 40 {
		t.Fatalf("tickets fracos ou repetidos: %q %q", a, b)
	}
	for key := range s.entries {
		if key == a || key == b {
			t.Fatal("ticket guardado em claro")
		}
	}
}

func TestTicketUsoUnico(t *testing.T) {
	s, _ := newTestTickets()
	ticket, _ := s.Issue(auth.Claims{UserID: "u1", Type: "access", Version: 3})
	claims, ok := s.Redeem(ticket)
	if !ok || claims.UserID != "u1" || claims.Type != "access" || claims.Version != 3 {
		t.Fatalf("primeiro uso = (%+v, %v)", claims, ok)
	}
	if _, ok := s.Redeem(ticket); ok {
		t.Fatal("o mesmo ticket valeu duas vezes")
	}
}

func TestTicketExpira(t *testing.T) {
	s, clock := newTestTickets()
	ticket, _ := s.Issue(auth.Claims{UserID: "u1", Type: "access"})
	clock.t = clock.t.Add(TicketTTL + time.Second)
	if _, ok := s.Redeem(ticket); ok {
		t.Fatal("ticket vencido valeu")
	}
}

func TestTicketDesconhecidoOuVazio(t *testing.T) {
	s, _ := newTestTickets()
	for _, ticket := range []string{"", "nao-existe"} {
		if _, ok := s.Redeem(ticket); ok {
			t.Fatalf("ticket %q valeu", ticket)
		}
	}
}

func TestTicketLimitePorUsuario(t *testing.T) {
	s, _ := newTestTickets()
	var last string
	for i := 0; i < maxTicketsPerUser; i++ {
		ticket, err := s.Issue(auth.Claims{UserID: "u1", Type: "access"})
		if err != nil {
			t.Fatalf("ticket %d: %v", i, err)
		}
		last = ticket
	}
	if _, err := s.Issue(auth.Claims{UserID: "u1", Type: "access"}); !errors.Is(err, ErrTooManyTickets) {
		t.Fatalf("acima do limite: err = %v", err)
	}
	if _, err := s.Issue(auth.Claims{UserID: "u2", Type: "access"}); err != nil {
		t.Fatalf("o limite de u1 não vale para u2: %v", err)
	}
	s.Redeem(last)
	if _, err := s.Issue(auth.Claims{UserID: "u1", Type: "access"}); err != nil {
		t.Fatalf("depois de usar um, emite de novo: %v", err)
	}
}

func TestTicketVencidosSaemDaMemoria(t *testing.T) {
	s, clock := newTestTickets()
	for i := 0; i < maxTicketsPerUser; i++ {
		s.Issue(auth.Claims{UserID: "u1", Type: "access"})
	}
	clock.t = clock.t.Add(TicketTTL + time.Second)
	if _, err := s.Issue(auth.Claims{UserID: "u1", Type: "access"}); err != nil {
		t.Fatalf("vencidos ainda contam no limite: %v", err)
	}
	if len(s.entries) != 1 {
		t.Fatalf("entradas = %d, quer 1 (vencidas varridas)", len(s.entries))
	}
}
