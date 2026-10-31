package musiclinks

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func finderOf(name string, calls *atomic.Int32, links Links, err error) finder {
	return finder{name: name, timeout: time.Second, find: func(context.Context, Query) (Links, error) {
		calls.Add(1)
		return links, err
	}}
}

func TestServiceMergesSourcesAndSkipsFailures(t *testing.T) {
	var a, b, c atomic.Int32
	s := newService([]finder{
		finderOf("deezer", &a, Links{Deezer: "https://www.deezer.com/track/1"}, nil),
		finderOf("itunes", &b, nil, errors.New("fora do ar")),
		finderOf("youtube", &c, Links{YouTube: "https://www.youtube.com/watch?v=x", YouTubeMusic: "https://music.youtube.com/watch?v=x"}, nil),
	})
	got := s.Links(context.Background(), elis)
	if len(got) != 3 || got[Deezer] == "" || got[YouTube] == "" || got[AppleMusic] != "" {
		t.Fatalf("links = %v", got)
	}
}

func TestServiceCachesCompleteResultsForLong(t *testing.T) {
	now := time.Unix(0, 0)
	var calls atomic.Int32
	s := newService([]finder{finderOf("deezer", &calls, Links{}, nil)}) // não achou = resposta completa
	s.now = func() time.Time { return now }
	s.Links(context.Background(), elis)
	now = now.Add(cacheTTL - time.Minute)
	s.Links(context.Background(), Query{Artist: "ELIS REGINA ", Title: "águas de março"})
	if calls.Load() != 1 {
		t.Fatalf("buscas = %d, want 1 (a mesma música vem do cache)", calls.Load())
	}
	now = now.Add(2 * time.Minute)
	s.Links(context.Background(), elis)
	if calls.Load() != 2 {
		t.Fatalf("buscas = %d, want 2 (expirou)", calls.Load())
	}
}

func TestServiceRetriesSoonAfterAFailure(t *testing.T) {
	now := time.Unix(0, 0)
	var calls atomic.Int32
	s := newService([]finder{finderOf("deezer", &calls, nil, errors.New("timeout"))})
	s.now = func() time.Time { return now }
	s.Links(context.Background(), elis)
	s.Links(context.Background(), elis)
	if calls.Load() != 1 {
		t.Fatalf("buscas = %d, want 1 (falha também segura um pouco)", calls.Load())
	}
	now = now.Add(retryTTL + time.Second)
	s.Links(context.Background(), elis)
	if calls.Load() != 2 {
		t.Fatalf("buscas = %d, want 2", calls.Load())
	}
}

func TestServiceRespectsSourceLimit(t *testing.T) {
	var calls atomic.Int32
	f := finderOf("itunes", &calls, Links{AppleMusic: "https://music.apple.com/x"}, nil)
	f.limit = newLimiter(1, time.Hour)
	s := newService([]finder{f})
	s.Links(context.Background(), Query{Title: "a"})
	if got := s.Links(context.Background(), Query{Title: "b"}); len(got) != 0 {
		t.Fatalf("acima do limite cai na busca (sem link): %v", got)
	}
	if calls.Load() != 1 {
		t.Fatalf("chamadas = %d, want 1", calls.Load())
	}
}

func TestServiceGivesUpOnSlowSource(t *testing.T) {
	slow := finder{name: "lento", timeout: 20 * time.Millisecond, find: func(ctx context.Context, _ Query) (Links, error) {
		<-ctx.Done()
		return nil, ctx.Err()
	}}
	s := newService([]finder{slow})
	start := time.Now()
	if got := s.Links(context.Background(), elis); len(got) != 0 {
		t.Fatalf("links = %v", got)
	}
	if time.Since(start) > time.Second {
		t.Fatal("o timeout da fonte não segurou")
	}
}

func TestServiceCacheStaysBounded(t *testing.T) {
	var calls atomic.Int32
	s := newService([]finder{finderOf("deezer", &calls, Links{}, nil)})
	for i := range cacheMax + 5 {
		s.Links(context.Background(), Query{Title: string(rune('a'+i%26)) + time.Duration(i).String()})
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.cache) > cacheMax {
		t.Fatalf("cache = %d, máximo %d", len(s.cache), cacheMax)
	}
}

func TestNewServiceRegistersSpotifyOnlyWithCredentials(t *testing.T) {
	without := NewService(Config{}, &fakeVideos{})
	with := NewService(Config{SpotifyID: "id", SpotifySecret: "s"}, &fakeVideos{})
	if len(with.finders) != len(without.finders)+1 {
		t.Fatalf("fontes: com Spotify %d, sem %d", len(with.finders), len(without.finders))
	}
}
