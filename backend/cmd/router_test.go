package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// O app desktop (file://) pede só o começo de um arquivo de texto com Range:
// o preflight do CORS precisa liberar esse cabeçalho.
func TestRouterCORSAllowsRange(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router, _, _ := newRouter(nil)
	router.GET("/api/media/x", func(c *gin.Context) { c.Status(http.StatusOK) })

	req := httptest.NewRequest(http.MethodOptions, "/api/media/x", nil)
	req.Header.Set("Origin", "null")
	req.Header.Set("Access-Control-Request-Method", "GET")
	req.Header.Set("Access-Control-Request-Headers", "range")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	allowed := strings.ToLower(rec.Header().Get("Access-Control-Allow-Headers"))
	if !strings.Contains(allowed, "range") {
		t.Fatalf("status = %d, Allow-Headers = %q", rec.Code, allowed)
	}
}
