package main

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"gin-quickstart/backend/internal/platform/httpmetrics"

	"github.com/gin-gonic/gin"
)

// O middleware das métricas entra antes do grupo /api: vale para as rotas
// do /api e as da raiz registradas depois.
func TestMiddlewaresValemParaAsRotasDoAPI(t *testing.T) {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	recorder := httpmetrics.New(httpmetrics.Config{Skip: skipMetrics, ConnectionRoute: "/ws"})
	a := &app{}
	a.middlewares = append(a.middlewares, recorder.Middleware())
	a.route(func(r *gin.Engine, api *gin.RouterGroup) {
		api.GET("/channels/:id", func(c *gin.Context) { c.Status(http.StatusOK) })
		r.GET("/updates/*file", func(c *gin.Context) { c.Status(http.StatusOK) })
		r.Any("/rtc", func(c *gin.Context) { c.Status(http.StatusOK) })
	})
	a.registerRoutes(router)
	for _, path := range []string{"/api/channels/1", "/updates/app.exe"} {
		router.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
	}
	rtc := httptest.NewRequest(http.MethodGet, "/rtc", nil)
	rtc.Header.Set("Upgrade", "websocket")
	router.ServeHTTP(httptest.NewRecorder(), rtc)
	if m := recorder.TakeMinute(); m.Requests != 1 {
		t.Errorf("pedidos = %d, quer 1 (download longo e o /rtc ficam de fora)", m.Requests)
	}
}
