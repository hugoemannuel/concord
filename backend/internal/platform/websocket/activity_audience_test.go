package websocket

import (
	"context"
	"errors"
	"testing"
	"time"
)

// countingAudience conta as consultas (cada uma seria um SELECT no Postgres).
type countingAudience struct {
	ids   map[string][]string
	err   error
	calls int
}

func (c *countingAudience) Audience(_ context.Context, id string) ([]string, error) {
	c.calls++
	if c.err != nil {
		return nil, c.err
	}
	return c.ids[id], nil
}

func TestCachedAudienceReusesWithinTTL(t *testing.T) {
	now := time.Unix(0, 0)
	inner := &countingAudience{ids: map[string][]string{"a": {"b", "c"}}}
	cached := newCachedAudience(inner, func() time.Time { return now })

	for i := 0; i < 3; i++ {
		ids, err := cached.Audience(context.Background(), "a")
		if err != nil || len(ids) != 2 {
			t.Fatalf("ids = %v, err = %v", ids, err)
		}
	}
	if inner.calls != 1 {
		t.Fatalf("consultas = %d, quer 1", inner.calls)
	}

	now = now.Add(audienceTTL)
	if _, err := cached.Audience(context.Background(), "a"); err != nil {
		t.Fatal(err)
	}
	if inner.calls != 2 {
		t.Fatalf("depois do prazo: consultas = %d, quer 2", inner.calls)
	}
}

func TestCachedAudienceDoesNotCacheErrors(t *testing.T) {
	inner := &countingAudience{err: errors.New("banco fora")}
	cached := newCachedAudience(inner, time.Now)

	for i := 0; i < 2; i++ {
		if _, err := cached.Audience(context.Background(), "a"); err == nil {
			t.Fatal("quer o erro da consulta")
		}
	}
	if inner.calls != 2 {
		t.Fatalf("consultas = %d, quer 2 (erro não fica em cache)", inner.calls)
	}
}

// Troca de música com o público em várias conexões: cada uma recebe uma vez.
func TestActivityReachesEveryAudienceConnectionOnce(t *testing.T) {
	h := NewHub()
	h.SetAudience(fakeAudience{"a": {"friend", "friend", "ghost"}})
	a := newTestClient(h, "a")
	phone, desktop := newTestClient(h, "friend"), newTestClient(h, "friend")
	for _, c := range []*Client{a, phone, desktop} {
		h.Register(c)
		subscribeUser(h, c, c.userID)
	}

	setGame(h, "a", "VALORANT")

	for name, c := range map[string]*Client{"self": a, "phone": phone, "desktop": desktop} {
		if evs := drainActivity(t, c); len(evs) != 1 {
			t.Fatalf("%s: %d eventos, quer 1", name, len(evs))
		}
	}
}
