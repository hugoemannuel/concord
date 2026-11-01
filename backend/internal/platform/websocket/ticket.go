package websocket

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"sync"
	"time"

	"gin-quickstart/backend/internal/auth"
)

// Ticket do WebSocket (docs/adr/0046): o app troca o Bearer por um ticket
// aleatório de uso único e vida curta, e conecta com ?ticket=. O token de
// acesso (24 h) deixa de ir na URL. Os tickets ficam só em memória, guardados
// pelo hash (um dump da memória não mostra ticket usável); há um processo só.

// TicketTTL: tempo entre pedir o ticket e abrir a conexão.
const TicketTTL = 30 * time.Second

// maxTicketsPerUser: tickets ainda não usados de uma conta. O app pede um por
// tentativa de conexão (com espera entre as tentativas); acima disso é abuso.
const maxTicketsPerUser = 20

var ErrTooManyTickets = errors.New("muitos tickets em aberto")

type ticketEntry struct {
	claims  auth.Claims
	expires time.Time
}

type TicketStore struct {
	ttl       time.Duration
	now       func() time.Time
	mu        sync.Mutex
	entries   map[string]ticketEntry
	perUser   map[string]int
	lastSweep time.Time
}

func NewTicketStore(ttl time.Duration) *TicketStore {
	return &TicketStore{
		ttl:     ttl,
		now:     time.Now,
		entries: map[string]ticketEntry{},
		perUser: map[string]int{},
	}
}

func ticketKey(ticket string) string {
	sum := sha256.Sum256([]byte(ticket))
	return hex.EncodeToString(sum[:])
}

// Issue cria um ticket para quem tem estas credenciais (conta ou visitante).
func (s *TicketStore) Issue(claims auth.Claims) (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	ticket := base64.RawURLEncoding.EncodeToString(raw)

	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	s.sweepLocked(now)
	if s.perUser[claims.UserID] >= maxTicketsPerUser {
		return "", ErrTooManyTickets
	}
	s.entries[ticketKey(ticket)] = ticketEntry{claims: claims, expires: now.Add(s.ttl)}
	s.perUser[claims.UserID]++
	return ticket, nil
}

// Redeem gasta o ticket: vale uma vez só e só dentro do prazo.
func (s *TicketStore) Redeem(ticket string) (auth.Claims, bool) {
	if ticket == "" {
		return auth.Claims{}, false
	}
	key := ticketKey(ticket)
	s.mu.Lock()
	defer s.mu.Unlock()
	entry, ok := s.entries[key]
	if !ok {
		return auth.Claims{}, false
	}
	s.dropLocked(key, entry)
	return entry.claims, s.now().Before(entry.expires)
}

func (s *TicketStore) dropLocked(key string, entry ticketEntry) {
	delete(s.entries, key)
	if s.perUser[entry.claims.UserID]--; s.perUser[entry.claims.UserID] <= 0 {
		delete(s.perUser, entry.claims.UserID)
	}
}

// sweepLocked tira os vencidos, no máximo uma vez por TTL (a varredura é O(n)).
func (s *TicketStore) sweepLocked(now time.Time) {
	if now.Sub(s.lastSweep) < s.ttl {
		return
	}
	s.lastSweep = now
	for key, entry := range s.entries {
		if !now.Before(entry.expires) {
			s.dropLocked(key, entry)
		}
	}
}
