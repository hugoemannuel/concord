// Package bodylimit põe um teto no corpo de todo pedido da API. Sem ele, o
// ShouldBindJSON lia o corpo inteiro para a memória: um JSON de alguns GB
// numa rota sem login (POST /api/auth/refresh) derrubava o processo.
//
// O teto é o da categoria do pedido; as rotas continuam com o limite próprio
// delas (sempre menor), que vale por dentro deste.
package bodylimit

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

const (
	// DefaultLimit: JSON e qualquer corpo que não seja upload. O maior JSON
	// legítimo (publicação do changelog fica de fora, ver APIConfig) tem
	// dezenas de KB.
	DefaultLimit int64 = 1 << 20
	// UploadLimit: multipart e as rotas de LargeRoutes. O maior upload é o
	// anexo do chat (media.MaxFileBytes, 25 MB) mais a folga do multipart.
	UploadLimit int64 = 32 << 20
)

// Config: os dois tetos e as rotas que recebem corpo grande sem multipart.
type Config struct {
	Default int64
	Upload  int64
	// LargeRoutes: "MÉTODO rota", com a rota como o gin a registra
	// (c.FullPath(), ex.: "POST /api/users/me/app-sounds/:event").
	LargeRoutes []string
}

// APIConfig: os tetos do /api. Os uploads crus (o corpo é o próprio arquivo de
// áudio, ver media.SaveAudio) e a publicação do changelog pelo CI (até 1000
// entradas) ganham o teto de upload.
func APIConfig() Config {
	return Config{
		Default: DefaultLimit,
		Upload:  UploadLimit,
		LargeRoutes: []string{
			"POST /api/users/me/entrance-sound",
			"POST /api/users/me/app-sounds/:event",
			"PUT /api/changelog/:version",
		},
	}
}

// Middleware corta a leitura do corpo no teto do pedido (http.MaxBytesReader):
// passou dele, a leitura falha e a rota responde 400/413 como já faz.
func Middleware(cfg Config) gin.HandlerFunc {
	large := make(map[string]bool, len(cfg.LargeRoutes))
	for _, route := range cfg.LargeRoutes {
		large[route] = true
	}
	return func(c *gin.Context) {
		limit := cfg.Default
		// Só multipart (e as rotas grandes) sobem o teto: o Content-Type é do
		// cliente, mas o multipart com JSON dentro só chega a UploadLimit.
		if c.ContentType() == "multipart/form-data" || large[c.Request.Method+" "+c.FullPath()] {
			limit = cfg.Upload
		}
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)
		c.Next()
	}
}
