package gifs

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestGiphyServiceEmptyKey(t *testing.T) {
	t.Parallel()
	svc := NewService("")
	items, err := svc.Trending(context.Background(), 10, 0)
	if err != nil {
		t.Fatalf("expected nil error, got %v", err)
	}
	if len(items) != 0 {
		t.Fatalf("expected empty items without api key, got %d", len(items))
	}
}

func TestGiphyServiceCacheAndFetch(t *testing.T) {
	t.Parallel()

	calls := 0
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{
			"data": [
				{
					"id": "abc123",
					"title": "funny cat",
					"images": {
						"original": { "url": "https://media.giphy.com/cat.gif", "width": "200", "height": "200" },
						"fixed_height": { "url": "https://media.giphy.com/cat-fixed.gif", "width": "150", "height": "150" },
						"downsized_medium": { "url": "https://media.giphy.com/cat-downsized.gif", "width": "180", "height": "180" }
					}
				}
			]
		}`))
	}))
	defer ts.Close()

	svc := NewService("dummy-key")
	svc.httpClient = ts.Client()

	items, err := svc.fetchGiphy(context.Background(), ts.URL)
	if err != nil {
		t.Fatalf("fetch error: %v", err)
	}
	if len(items) != 1 || items[0].ID != "abc123" || items[0].Title != "funny cat" {
		t.Fatalf("unexpected items: %+v", items)
	}
	if items[0].Width != 200 || items[0].Height != 200 {
		t.Fatalf("expected 200x200, got %dx%d", items[0].Width, items[0].Height)
	}
	if items[0].URL != "https://media.giphy.com/cat-downsized.gif" || items[0].PreviewURL != "https://media.giphy.com/cat-fixed.gif" {
		t.Fatalf("unexpected urls: %+v", items[0])
	}

	// Test cache hit (does not call HTTP server again)
	svc.setCached("trending:10:0", items)
	cached, err := svc.Trending(context.Background(), 10, 0)
	if err != nil || len(cached) != 1 || calls != 1 {
		t.Fatalf("expected cached hit without extra HTTP call, calls=%d, err=%v", calls, err)
	}
}

func TestGiphyHandlerRoutes(t *testing.T) {
	t.Parallel()
	h := NewHandler("")
	items, err := h.service.Search(context.Background(), "cats", 25, 0)
	if err != nil || len(items) != 0 {
		t.Fatalf("expected empty slice with empty key, got %v, %v", items, err)
	}
}
