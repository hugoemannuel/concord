package gifs

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"sync"
	"time"
)

type cacheEntry struct {
	items     []GIFItem
	expiresAt time.Time
}

type Service struct {
	apiKey     string
	httpClient *http.Client
	mu         sync.RWMutex
	cache      map[string]cacheEntry
	ttl        time.Duration
}

func NewService(apiKey string) *Service {
	return &Service{
		apiKey: apiKey,
		httpClient: &http.Client{
			Timeout: 8 * time.Second,
		},
		cache: make(map[string]cacheEntry),
		ttl:   5 * time.Minute,
	}
}

func (s *Service) getCached(key string) ([]GIFItem, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, found := s.cache[key]
	if !found || time.Now().After(entry.expiresAt) {
		return nil, false
	}
	return entry.items, true
}

func (s *Service) setCached(key string, items []GIFItem) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Limpeza básica se cache crescer muito
	if len(s.cache) > 200 {
		now := time.Now()
		for k, v := range s.cache {
			if now.After(v.expiresAt) {
				delete(s.cache, k)
			}
		}
	}

	s.cache[key] = cacheEntry{
		items:     items,
		expiresAt: time.Now().Add(s.ttl),
	}
}

func (s *Service) Trending(ctx context.Context, limit, offset int) ([]GIFItem, error) {
	if s.apiKey == "" {
		return []GIFItem{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 25
	}
	if offset < 0 {
		offset = 0
	}

	cacheKey := fmt.Sprintf("trending:%d:%d", limit, offset)
	if items, ok := s.getCached(cacheKey); ok {
		return items, nil
	}

	endpoint := fmt.Sprintf(
		"https://api.giphy.com/v1/gifs/trending?api_key=%s&limit=%d&offset=%d&rating=g",
		url.QueryEscape(s.apiKey),
		limit,
		offset,
	)

	items, err := s.fetchGiphy(ctx, endpoint)
	if err != nil {
		return nil, err
	}

	s.setCached(cacheKey, items)
	return items, nil
}

func (s *Service) Search(ctx context.Context, query string, limit, offset int) ([]GIFItem, error) {
	if s.apiKey == "" || query == "" {
		return []GIFItem{}, nil
	}
	if limit <= 0 || limit > 50 {
		limit = 25
	}
	if offset < 0 {
		offset = 0
	}

	cacheKey := fmt.Sprintf("search:%s:%d:%d", query, limit, offset)
	if items, ok := s.getCached(cacheKey); ok {
		return items, nil
	}

	endpoint := fmt.Sprintf(
		"https://api.giphy.com/v1/gifs/search?api_key=%s&q=%s&limit=%d&offset=%d&rating=g",
		url.QueryEscape(s.apiKey),
		url.QueryEscape(query),
		limit,
		offset,
	)

	items, err := s.fetchGiphy(ctx, endpoint)
	if err != nil {
		return nil, err
	}

	s.setCached(cacheKey, items)
	return items, nil
}

func (s *Service) fetchGiphy(ctx context.Context, endpoint string) ([]GIFItem, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		log.Printf("[giphy] request error: %v", err)
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		log.Printf("[giphy] unexpected status code: %d", resp.StatusCode)
		return []GIFItem{}, nil
	}

	var parsed GiphyAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		log.Printf("[giphy] json decode error: %v", err)
		return nil, err
	}

	items := make([]GIFItem, 0, len(parsed.Data))
	for _, item := range parsed.Data {
		url := item.Images.DownsizedMedium.URL
		if url == "" {
			url = item.Images.Original.URL
		}
		preview := item.Images.FixedHeight.URL
		if preview == "" {
			preview = url
		}

		w, _ := strconv.Atoi(item.Images.Original.Width)
		h, _ := strconv.Atoi(item.Images.Original.Height)
		if w == 0 || h == 0 {
			w, _ = strconv.Atoi(item.Images.FixedHeight.Width)
			h, _ = strconv.Atoi(item.Images.FixedHeight.Height)
		}

		items = append(items, GIFItem{
			ID:         item.ID,
			Title:      item.Title,
			URL:        url,
			PreviewURL: preview,
			Width:      w,
			Height:     h,
		})
	}

	return items, nil
}
