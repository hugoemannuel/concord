package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"gin-quickstart/backend/internal/platform/clientip"
	"gin-quickstart/backend/internal/platform/health"
	"gin-quickstart/backend/internal/platform/httplog"
	"gin-quickstart/backend/internal/platform/lifecycle"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5/pgxpool"
)

// newRouter monta o gin com os middlewares globais e o /healthz.
func newRouter(db *pgxpool.Pool) (*gin.Engine, *lifecycle.Streams, *health.Readiness) {
	// Como o gin.Default(), mas o log não grava tokens que vão na URL.
	router := gin.New()
	// Em quem confiar para o IP do cliente (log e limite de login).
	trustedProxies := clientip.TrustedProxies(os.Getenv("HOST"), os.Getenv("TRUSTED_PROXIES"))
	if err := clientip.Configure(router, trustedProxies); err != nil {
		log.Fatalf("invalid TRUSTED_PROXIES: %v", err)
	}
	log.Printf("trusted proxies: %v", trustedProxies)
	// O deploy e o apply-caddyfile consultam /healthz em laço: fora do log.
	router.Use(gin.LoggerWithConfig(gin.LoggerConfig{Formatter: httplog.Formatter, SkipPaths: []string{"/healthz"}}), gin.Recovery())

	// Downloads longos não seguram o desligamento (ver isLongDownload).
	streams := lifecycle.NewStreams()
	streamsMiddleware := streams.Gin()
	router.Use(func(c *gin.Context) {
		if isLongDownload(c.Request) {
			streamsMiddleware(c)
			return
		}
		c.Next()
	})

	// Pronto só depois de recarregar as chamadas (ver SetReady em main).
	readiness := health.New(db.Ping)
	router.GET("/healthz", readiness.Handler)

	router.Use(cors.New(cors.Config{
		// O app empacotado carrega via file:// e a auth é por Bearer (sem
		// cookies), então qualquer origem pode chamar a API.
		AllowOriginFunc:  func(string) bool { return true },
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		// Range: a prévia de arquivo de texto do app pede só o começo.
		AllowHeaders:     []string{"Origin", "Content-Type", "Authorization", "Range"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))
	return router, streams, readiness
}

// isLongDownload: respostas que o desligamento corta na hora em vez de
// esperar (download de atualização, vídeo/áudio do chat). Quem baixa retoma
// com Range.
func isLongDownload(r *http.Request) bool {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		return false
	}
	p := r.URL.Path
	return strings.HasPrefix(p, "/updates/") ||
		(strings.HasPrefix(p, "/api/media/") && p != "/api/media/token")
}
