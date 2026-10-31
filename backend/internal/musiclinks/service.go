package musiclinks

import (
	"context"
	"errors"
	"log"
	"maps"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	// cacheTTL: a mesma música é clicada por várias pessoas; o link não muda.
	cacheTTL = 24 * time.Hour
	// retryTTL: com alguma fonte fora (erro, timeout, cota), tenta de novo logo.
	retryTTL = 5 * time.Minute
	cacheMax = 2000
	// httpTimeout: as APIs respondem em ~0,4 s; passou disso, fica a busca.
	httpTimeout = 3 * time.Second
	// youtubeTimeout: o yt-dlp leva ~3 s para buscar.
	youtubeTimeout = 8 * time.Second
)

type Config struct {
	SpotifyID, SpotifySecret string
}

func ConfigFromEnv() Config {
	return Config{SpotifyID: os.Getenv("SPOTIFY_CLIENT_ID"), SpotifySecret: os.Getenv("SPOTIFY_CLIENT_SECRET")}
}

// finder: uma fonte, com o tempo máximo e o limite de chamadas dela.
type finder struct {
	name    string
	timeout time.Duration
	limit   *limiter
	find    func(context.Context, Query) (Links, error)
}

type cacheEntry struct {
	links   Links
	expires time.Time
}

type Service struct {
	finders []finder
	now     func() time.Time

	mu    sync.Mutex
	cache map[string]cacheEntry
}

func NewService(cfg Config, videos VideoSearcher) *Service {
	client := &http.Client{Timeout: httpTimeout}
	finders := []finder{
		{name: "itunes", timeout: httpTimeout, limit: newLimiter(20, time.Minute),
			find: (&itunes{base: "https://itunes.apple.com", client: client}).find},
		{name: "deezer", timeout: httpTimeout, limit: newLimiter(40, 5*time.Second),
			find: (&deezer{base: "https://api.deezer.com", client: client}).find},
		{name: "youtube", timeout: youtubeTimeout, limit: newLimiter(30, time.Minute),
			find: (&youtube{videos: videos}).find},
	}
	if cfg.SpotifyID != "" && cfg.SpotifySecret != "" {
		sp := &spotify{accounts: "https://accounts.spotify.com", api: "https://api.spotify.com",
			id: cfg.SpotifyID, secret: cfg.SpotifySecret, client: client}
		finders = append(finders, finder{name: "spotify", timeout: httpTimeout, limit: newLimiter(60, time.Minute), find: sp.find})
	}
	return newService(finders)
}

func newService(finders []finder) *Service {
	return &Service{finders: finders, now: time.Now, cache: map[string]cacheEntry{}}
}

func cacheKey(q Query) string {
	return normalize(q.Artist) + "\x00" + normalize(q.Title)
}

// Links: os links diretos que deu para achar (do cache, se já buscados).
func (s *Service) Links(ctx context.Context, q Query) Links {
	key := cacheKey(q)
	if links, ok := s.cached(key); ok {
		return links
	}
	links, complete := s.collect(ctx, q)
	ttl := cacheTTL
	if !complete {
		ttl = retryTTL
	}
	s.store(key, links, ttl)
	return maps.Clone(links)
}

func (s *Service) cached(key string) (Links, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.cache[key]
	if !ok || !s.now().Before(e.expires) {
		return nil, false
	}
	return maps.Clone(e.links), true
}

func (s *Service) store(key string, links Links, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	if len(s.cache) >= cacheMax {
		maps.DeleteFunc(s.cache, func(_ string, e cacheEntry) bool { return !now.Before(e.expires) })
		if len(s.cache) >= cacheMax {
			clear(s.cache)
		}
	}
	s.cache[key] = cacheEntry{links: links, expires: now.Add(ttl)}
}

// collect consulta as fontes em paralelo; complete = nenhuma falhou.
func (s *Service) collect(ctx context.Context, q Query) (Links, bool) {
	type result struct {
		links Links
		err   error
	}
	results := make(chan result, len(s.finders))
	for _, f := range s.finders {
		go func() {
			links, err := runFinder(ctx, f, q)
			if err != nil {
				log.Printf("[musiclinks] %s: %v", f.name, err)
			}
			results <- result{links, err}
		}()
	}
	out, complete := Links{}, true
	for range s.finders {
		r := <-results
		complete = complete && r.err == nil
		maps.Copy(out, r.links)
	}
	return out, complete
}

var errLimited = errors.New("limite de chamadas da fonte")

// runFinder: a fonte termina (e o resultado vai para o cache) mesmo se quem
// pediu fechou o menu; o timeout dela é o que segura.
func runFinder(ctx context.Context, f finder, q Query) (Links, error) {
	if !f.limit.allow() {
		return nil, errLimited
	}
	fctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), f.timeout)
	defer cancel()
	return f.find(fctx, Query{Artist: strings.TrimSpace(q.Artist), Title: strings.TrimSpace(q.Title)})
}
