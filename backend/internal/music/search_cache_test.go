package music

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"
)

type fakeFetch struct {
	mu      sync.Mutex
	calls   int
	tracks  []Track
	err     error
	release chan struct{}
}

func (f *fakeFetch) fetch(context.Context) ([]Track, error) {
	f.mu.Lock()
	f.calls++
	release := f.release
	f.mu.Unlock()
	if release != nil {
		<-release
	}
	return f.tracks, f.err
}

func (f *fakeFetch) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

var oneTrack = []Track{{VideoID: "dQw4w9WgXcQ", Title: "Never", DurationMs: 213_000}}

func TestSearchCacheReusesUntilExpired(t *testing.T) {
	now := time.Unix(0, 0)
	c := &searchCache{now: func() time.Time { return now }}
	f := &fakeFetch{tracks: oneTrack}
	for range 2 {
		if got, err := c.get(context.Background(), "Queen", f.fetch); err != nil || len(got) != 1 {
			t.Fatalf("get = %v, %v", got, err)
		}
	}
	if f.count() != 1 {
		t.Fatalf("buscas = %d, want 1 (a 2ª vem do cache)", f.count())
	}
	now = now.Add(searchCacheTTL + time.Second)
	if _, err := c.get(context.Background(), "queen", f.fetch); err != nil {
		t.Fatal(err)
	}
	if f.count() != 2 {
		t.Fatalf("buscas = %d, want 2 (expirou)", f.count())
	}
}

func TestSearchCacheDoesNotKeepFailuresOrEmpty(t *testing.T) {
	c := &searchCache{}
	boom := errors.New("yt-dlp caiu")
	f := &fakeFetch{err: boom}
	if _, err := c.get(context.Background(), "q", f.fetch); !errors.Is(err, boom) {
		t.Fatalf("err = %v", err)
	}
	f.err = nil // vazio
	if _, err := c.get(context.Background(), "q", f.fetch); err != nil {
		t.Fatal(err)
	}
	f.tracks = oneTrack
	if got, _ := c.get(context.Background(), "q", f.fetch); len(got) != 1 {
		t.Fatalf("got = %v", got)
	}
	if f.count() != 3 {
		t.Fatalf("buscas = %d, want 3", f.count())
	}
}

// Menu aberto e clique em "Adicionar à fila" juntos: uma busca só.
func TestSearchCacheSharesInFlightSearch(t *testing.T) {
	c := &searchCache{}
	f := &fakeFetch{tracks: oneTrack, release: make(chan struct{})}
	results := make(chan int, 2)
	for range 2 {
		go func() {
			got, _ := c.get(context.Background(), "q", f.fetch)
			results <- len(got)
		}()
	}
	eventually(t, "1ª busca em andamento", func() bool { return f.count() == 1 })
	eventually(t, "2º esperando a mesma busca", func() bool {
		c.mu.Lock()
		defer c.mu.Unlock()
		return c.flights["q"] != nil && c.flights["q"].waiters == 1
	})
	close(f.release)
	for range 2 {
		if n := <-results; n != 1 {
			t.Fatalf("resultado = %d faixas", n)
		}
	}
	if f.count() != 1 {
		t.Fatalf("buscas = %d, want 1", f.count())
	}
}

func TestSearchCacheWaiterGivesUpWithItsContext(t *testing.T) {
	c := &searchCache{}
	f := &fakeFetch{tracks: oneTrack, release: make(chan struct{})}
	defer close(f.release)
	go func() { _, _ = c.get(context.Background(), "q", f.fetch) }()
	eventually(t, "busca em andamento", func() bool { return f.count() == 1 })
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := c.get(ctx, "q", f.fetch); !errors.Is(err, context.Canceled) {
		t.Fatalf("err = %v, want context.Canceled", err)
	}
}

func TestSearchCacheStaysBounded(t *testing.T) {
	c := &searchCache{}
	f := &fakeFetch{tracks: oneTrack}
	for i := range searchCacheMax + 10 {
		if _, err := c.get(context.Background(), fmt.Sprint("q", i), f.fetch); err != nil {
			t.Fatal(err)
		}
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.entries) > searchCacheMax {
		t.Fatalf("entradas = %d, máximo %d", len(c.entries), searchCacheMax)
	}
}
