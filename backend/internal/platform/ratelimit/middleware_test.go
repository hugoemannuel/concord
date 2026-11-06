package ratelimit

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func TestByIPPassaAteOLimiteDepois429ComRetryAfter(t *testing.T) {
	gin.SetMode(gin.TestMode)
	limiter := New(1, time.Minute, 10)
	router := gin.New()
	router.GET("/x", ByIP(limiter, "devagar"), func(c *gin.Context) { c.Status(http.StatusNoContent) })

	pedir := func(ip string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, "/x", nil)
		req.RemoteAddr = ip + ":1234"
		router.ServeHTTP(w, req)
		return w
	}

	if w := pedir("203.0.113.1"); w.Code != http.StatusNoContent {
		t.Fatalf("primeiro pedido = %d; quer 204", w.Code)
	}
	w := pedir("203.0.113.1")
	if w.Code != http.StatusTooManyRequests || w.Body.String() != `{"error":"devagar"}` {
		t.Fatalf("segundo pedido = %d %q", w.Code, w.Body.String())
	}
	if w.Header().Get("Retry-After") != "60" {
		t.Fatalf("Retry-After = %q; quer 60", w.Header().Get("Retry-After"))
	}
	if w := pedir("203.0.113.2"); w.Code != http.StatusNoContent {
		t.Fatalf("outro IP = %d; quer 204", w.Code)
	}
}
