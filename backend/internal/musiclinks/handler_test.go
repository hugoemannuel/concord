package musiclinks

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/gin-gonic/gin"
)

func serve(t *testing.T, s *Service, target string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	Routes(r.Group("/api"), NewHandler(s), func(c *gin.Context) { c.Set("userID", "u1") })
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, target, nil))
	return w
}

func TestHandlerReturnsDirectLinks(t *testing.T) {
	var calls atomic.Int32
	s := newService([]finder{finderOf("deezer", &calls, Links{Deezer: "https://www.deezer.com/track/1"}, nil)})
	w := serve(t, s, "/api/music/links?artist=Elis+Regina&title=%C3%81guas+de+Mar%C3%A7o")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var body struct {
		Links map[string]string `json:"links"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil || body.Links["deezer"] != "https://www.deezer.com/track/1" {
		t.Fatalf("body = %s", w.Body.String())
	}
}

func TestHandlerRejectsBadInput(t *testing.T) {
	s := newService([]finder{{name: "nunca", find: func(context.Context, Query) (Links, error) {
		t.Fatal("não devia buscar")
		return nil, nil
	}}})
	long := strings.Repeat("a", queryMax+1)
	for _, target := range []string{
		"/api/music/links?artist=Elis",
		"/api/music/links?title=+++",
		"/api/music/links?title=" + long,
		"/api/music/links?title=x&artist=" + long,
	} {
		if w := serve(t, s, target); w.Code != http.StatusBadRequest {
			t.Errorf("%s → %d, want 400", target, w.Code)
		}
	}
}
