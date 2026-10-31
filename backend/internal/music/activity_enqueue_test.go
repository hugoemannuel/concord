package music

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"
)

func replyText(t *testing.T, err error) string {
	t.Helper()
	var re ReplyError
	if !errors.As(err, &re) {
		t.Fatalf("err = %v, want ReplyError", err)
	}
	return re.Text
}

func TestEnqueueQueryAddsFirstSearchResult(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	if err := m.EnqueueQuery(context.Background(), "u1", "srv1", "Queen - Bohemian Rhapsody"); err != nil {
		t.Fatalf("err = %v", err)
	}
	if got := hub.publics(); len(got) != 1 || got[0] != TextAddedNow("caio", "Never", 213_000, "Sala 1") {
		t.Fatalf("público = %v", got)
	}
	eventually(t, "music:state", func() bool { return hub.last("music:state") != nil })
}

func TestEnqueueQueryGuards(t *testing.T) {
	t.Run("fora da voz", func(t *testing.T) {
		m, _ := newTestManager(t, false, true)
		err := m.EnqueueQuery(context.Background(), "u1", "srv1", "queen")
		if got := replyText(t, err); got != TextNotInVoice {
			t.Fatalf("texto = %q", got)
		}
	})
	t.Run("voz em outro servidor", func(t *testing.T) {
		m, _ := newTestManager(t, true, true)
		err := m.EnqueueQuery(context.Background(), "u1", "outro", "queen")
		if got := replyText(t, err); got != TextNotInVoice {
			t.Fatalf("texto = %q", got)
		}
	})
	t.Run("maestro removido", func(t *testing.T) {
		m, _ := newTestManager(t, true, false)
		err := m.EnqueueQuery(context.Background(), "u1", "srv1", "queen")
		if got := replyText(t, err); got != TextBotRemoved {
			t.Fatalf("texto = %q", got)
		}
	})
	t.Run("indisponível", func(t *testing.T) {
		m, _ := newTestManager(t, true, true)
		m.available = false
		err := m.EnqueueQuery(context.Background(), "u1", "srv1", "queen")
		if got := replyText(t, err); got != TextUnavailable {
			t.Fatalf("texto = %q", got)
		}
	})
}

func TestEnqueueQueryRejectsBadQuery(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	for _, q := range []string{"", "   ", strings.Repeat("a", queryMax+1)} {
		if err := m.EnqueueQuery(context.Background(), "u1", "srv1", q); !errors.Is(err, ErrInvalidQuery) {
			t.Errorf("%q → %v, want ErrInvalidQuery", q, err)
		}
	}
	if len(hub.publics()) != 0 {
		t.Fatalf("nada deveria entrar na fila: %v", hub.publics())
	}
}

type emptySearch struct{ mgrSource }

func (*emptySearch) Search(context.Context, string, int) ([]Track, error) { return nil, nil }

func TestEnqueueQueryWithoutResults(t *testing.T) {
	m, _ := newTestManager(t, true, true)
	m.deps.Source = &emptySearch{mgrSource{fakeSource{fail: map[string]bool{}}}}
	err := m.EnqueueQuery(context.Background(), "u1", "srv1", "xyzzy")
	if got := replyText(t, err); got != TextSearchEmpty("xyzzy") {
		t.Fatalf("texto = %q", got)
	}
}

type longFirstSearch struct{ mgrSource }

func (*longFirstSearch) Search(context.Context, string, int) ([]Track, error) {
	return []Track{
		{VideoID: "longoxxxxxx", Title: "Mix de 10h", DurationMs: maxVideoMs + 1},
		{VideoID: "aovivoxxxxx", Title: "Ao vivo", IsLive: true},
		{VideoID: "dQw4w9WgXcQ", Title: "Never", DurationMs: 213_000},
	}, nil
}

func TestEnqueueQuerySkipsLiveAndTooLongResults(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	m.deps.Source = &longFirstSearch{mgrSource{fakeSource{fail: map[string]bool{}}}}
	if err := m.EnqueueQuery(context.Background(), "u1", "srv1", "never gonna"); err != nil {
		t.Fatalf("err = %v", err)
	}
	if got := hub.publics(); len(got) != 1 {
		t.Fatalf("público = %v", got)
	}
}

// countingSource conta as chamadas ao yt-dlp (busca e resolução de link).
type countingSource struct {
	mgrSource
	mu                 sync.Mutex
	searches, resolves int
}

func (s *countingSource) Search(ctx context.Context, q string, n int) ([]Track, error) {
	s.mu.Lock()
	s.searches++
	s.mu.Unlock()
	return s.mgrSource.Search(ctx, q, n)
}

func (s *countingSource) Resolve(ctx context.Context, url string) (Track, error) {
	s.mu.Lock()
	s.resolves++
	s.mu.Unlock()
	return s.mgrSource.Resolve(ctx, url)
}

func (s *countingSource) counts() (searches, resolves int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.searches, s.resolves
}

// Regressão (#445): o resultado da busca já traz duração e "ao vivo"; resolver
// o link de novo custava um 2º yt-dlp (~4 s dos ~7,5 s do POST /enqueue).
func TestEnqueueQueryUsesSearchResultWithoutResolving(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	src := &countingSource{mgrSource: mgrSource{fakeSource{fail: map[string]bool{}}}}
	m.deps.Source = src
	if err := m.EnqueueQuery(context.Background(), "u1", "srv1", "never gonna"); err != nil {
		t.Fatalf("err = %v", err)
	}
	if searches, resolves := src.counts(); searches != 1 || resolves != 0 {
		t.Fatalf("buscas = %d, resoluções = %d; want 1 e 0", searches, resolves)
	}
	if got := hub.publics(); len(got) != 1 || got[0] != TextAddedNow("caio", "Never", 213_000, "Sala 1") {
		t.Fatalf("público = %v", got)
	}
}

// O menu "Ouvir também" já buscou a faixa ao abrir (links diretos): o clique
// em "Adicionar à fila" reaproveita a busca e não roda yt-dlp nenhum.
func TestEnqueueQueryReusesWarmSearch(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	src := &countingSource{mgrSource: mgrSource{fakeSource{fail: map[string]bool{}}}}
	m.deps.Source = src
	if _, err := m.FindTracks(context.Background(), "Queen - Bohemian Rhapsody"); err != nil {
		t.Fatalf("FindTracks: %v", err)
	}
	if err := m.EnqueueQuery(context.Background(), "u1", "srv1", "  queen - bohemian rhapsody "); err != nil {
		t.Fatalf("err = %v", err)
	}
	if searches, resolves := src.counts(); searches != 1 || resolves != 0 {
		t.Fatalf("buscas = %d, resoluções = %d; want 1 e 0", searches, resolves)
	}
	if len(hub.publics()) != 1 {
		t.Fatalf("público = %v", hub.publics())
	}
}

func TestEnqueueQueryRepliesWhenOnlyLiveResults(t *testing.T) {
	m, _ := newTestManager(t, true, true)
	m.deps.Source = &liveOnlySearch{mgrSource{fakeSource{fail: map[string]bool{}}}}
	err := m.EnqueueQuery(context.Background(), "u1", "srv1", "ao vivo")
	if got := replyText(t, err); got != TextLive {
		t.Fatalf("texto = %q", got)
	}
}

type liveOnlySearch struct{ mgrSource }

func (*liveOnlySearch) Search(context.Context, string, int) ([]Track, error) {
	return []Track{{VideoID: "aovivoxxxxx", Title: "Ao vivo", IsLive: true}}, nil
}

func TestEnqueueQueryOneAtATimePerUser(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	release := make(chan struct{})
	resolves := 0
	var mu sync.Mutex
	m.deps.Source = &blockingSearch{blockingSource{mgrSource: mgrSource{fakeSource{fail: map[string]bool{}}}, release: release, mu: &mu, n: &resolves}}
	done := make(chan error, 1)
	go func() { done <- m.EnqueueQuery(context.Background(), "u1", "srv1", "queen") }()
	eventually(t, "busca em andamento", func() bool { mu.Lock(); defer mu.Unlock(); return resolves == 1 })
	if err := m.EnqueueQuery(context.Background(), "u1", "srv1", "queen"); !errors.Is(err, ErrBusy) {
		t.Fatalf("2º pedido = %v, want ErrBusy", err)
	}
	close(release)
	if err := <-done; err != nil {
		t.Fatalf("1º pedido = %v", err)
	}
	if len(hub.publics()) != 1 {
		t.Fatalf("publics = %v", hub.publics())
	}
}

// blockingSearch segura a busca (o enqueue não resolve link nenhum).
type blockingSearch struct{ blockingSource }

func (s *blockingSearch) Search(ctx context.Context, q string, n int) ([]Track, error) {
	s.mu.Lock()
	*s.n++
	s.mu.Unlock()
	<-s.release
	return s.mgrSource.Search(ctx, q, n)
}
