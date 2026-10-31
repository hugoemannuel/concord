package music

// Cache das buscas por texto ("artista - título") da atividade de música: o
// menu "Ouvir também" busca a faixa ao abrir (link direto do YouTube) e o
// clique em "Adicionar à fila" reaproveita o resultado, sem um 2º yt-dlp.
// Busca igual em andamento é compartilhada (quem chega espera a mesma).
// Falha e resultado vazio não ficam guardados.

import (
	"context"
	"slices"
	"strings"
	"sync"
	"time"
)

const (
	// searchCacheTTL: os resultados de uma busca mudam pouco em meia hora.
	searchCacheTTL = 30 * time.Minute
	// searchCacheMax: teto de buscas guardadas (5 faixas cada, poucos KB).
	searchCacheMax = 500
)

type searchEntry struct {
	tracks  []Track
	expires time.Time
}

type searchFlight struct {
	done    chan struct{}
	tracks  []Track
	err     error
	waiters int
}

// searchCache: o valor zero já serve.
type searchCache struct {
	mu      sync.Mutex
	now     func() time.Time
	entries map[string]searchEntry
	flights map[string]*searchFlight
}

func searchKey(query string) string { return strings.ToLower(strings.TrimSpace(query)) }

func (c *searchCache) clock() time.Time {
	if c.now == nil {
		return time.Now()
	}
	return c.now()
}

// get devolve a busca guardada, espera a que já está em andamento ou roda
// fetch. fetch roda sem o cancelamento de ctx: termina e guarda mesmo se quem
// pediu desistiu (o próximo clique acha pronto).
func (c *searchCache) get(ctx context.Context, query string, fetch func(context.Context) ([]Track, error)) ([]Track, error) {
	key := searchKey(query)
	c.mu.Lock()
	if e, ok := c.entries[key]; ok && c.clock().Before(e.expires) {
		c.mu.Unlock()
		return slices.Clone(e.tracks), nil
	}
	f, running := c.flights[key]
	if running {
		f.waiters++
	} else {
		f = c.startLocked(key)
	}
	c.mu.Unlock()
	if !running {
		go c.run(context.WithoutCancel(ctx), key, f, fetch)
	}
	select {
	case <-f.done:
		return slices.Clone(f.tracks), f.err
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (c *searchCache) startLocked(key string) *searchFlight {
	if c.flights == nil {
		c.flights = map[string]*searchFlight{}
	}
	f := &searchFlight{done: make(chan struct{})}
	c.flights[key] = f
	return f
}

func (c *searchCache) run(ctx context.Context, key string, f *searchFlight, fetch func(context.Context) ([]Track, error)) {
	f.tracks, f.err = fetch(ctx)
	c.mu.Lock()
	defer c.mu.Unlock()
	delete(c.flights, key)
	if f.err == nil && len(f.tracks) > 0 {
		c.storeLocked(key, f.tracks)
	}
	close(f.done)
}

// storeLocked guarda e, no teto, joga fora as vencidas (ou tudo, se nenhuma venceu).
func (c *searchCache) storeLocked(key string, tracks []Track) {
	now := c.clock()
	if len(c.entries) >= searchCacheMax {
		for k, e := range c.entries {
			if !now.Before(e.expires) {
				delete(c.entries, k)
			}
		}
		if len(c.entries) >= searchCacheMax {
			clear(c.entries)
		}
	}
	if c.entries == nil {
		c.entries = map[string]searchEntry{}
	}
	c.entries[key] = searchEntry{tracks: tracks, expires: now.Add(searchCacheTTL)}
}

// FindTracks: os primeiros resultados da busca no YouTube, com cache. Serve o
// enqueue pela atividade e os links diretos do "Ouvir também" (musiclinks).
func (m *Manager) FindTracks(ctx context.Context, query string) ([]Track, error) {
	return m.found.get(ctx, query, func(ctx context.Context) ([]Track, error) {
		mctx, cancel := context.WithTimeout(ctx, metadataTimeout)
		defer cancel()
		return m.deps.Source.Search(mctx, query, searchCandidates)
	})
}
