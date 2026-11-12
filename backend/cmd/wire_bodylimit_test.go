package main

import (
	"bytes"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"gin-quickstart/backend/internal/platform/bodylimit"

	"github.com/gin-gonic/gin"
)

// Regressão: POST /api/auth/refresh (sem login) lia o JSON sem limite; um
// corpo de alguns GB derrubava o processo por memória. Toda rota do /api
// passa pelo teto de bodylimit.
func TestAPICortaCorpoAcimaDoLimite(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	a := &app{}
	a.route(func(_ *gin.Engine, api *gin.RouterGroup) {
		api.POST("/auth/refresh", func(c *gin.Context) {
			if _, err := io.Copy(io.Discard, c.Request.Body); err != nil {
				c.Status(http.StatusRequestEntityTooLarge)
				return
			}
			c.Status(http.StatusOK)
		})
	})
	a.registerRoutes(router)

	body := bytes.NewReader(make([]byte, bodylimit.DefaultLimit+1))
	req := httptest.NewRequest(http.MethodPost, "/api/auth/refresh", body)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	if rec.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("status = %d, want 413 (corpo acima de %d bytes)", rec.Code, bodylimit.DefaultLimit)
	}
}
