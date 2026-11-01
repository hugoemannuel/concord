// Package httplog é o log de pedidos do gin sem segredos na URL: o token de
// mídia (?token= em /api/media), o do WebSocket (?ticket= e o ?token= legado) e o do LiveKit
// (?access_token= em /rtc) viram REDACTED.
package httplog

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

var secretParams = []string{"token", "ticket", "access_token"}

// RedactQuery troca o valor dos parâmetros secretos; query ilegível é
// descartada inteira.
func RedactQuery(path string) string {
	base, rawQuery, found := strings.Cut(path, "?")
	if !found {
		return path
	}
	query, err := url.ParseQuery(rawQuery)
	if err != nil {
		return base
	}
	changed := false
	for _, key := range secretParams {
		if query.Has(key) {
			query.Set(key, "REDACTED")
			changed = true
		}
	}
	if !changed {
		return path
	}
	return base + "?" + query.Encode()
}

// Formatter é o formato padrão do gin (gin.defaultLogFormatter) com a URL
// passada por RedactQuery.
func Formatter(param gin.LogFormatterParams) string {
	var statusColor, methodColor, resetColor string
	if param.IsOutputColor() {
		statusColor = param.StatusCodeColor()
		methodColor = param.MethodColor()
		resetColor = param.ResetColor()
	}
	if param.Latency > time.Minute {
		param.Latency = param.Latency.Truncate(time.Second)
	}
	return fmt.Sprintf("[GIN] %v |%s %3d %s| %13v | %15s |%s %-7s %s %#v\n%s",
		param.TimeStamp.Format("2006/01/02 - 15:04:05"),
		statusColor, param.StatusCode, resetColor,
		param.Latency,
		param.ClientIP,
		methodColor, param.Method, resetColor,
		RedactQuery(param.Path),
		param.ErrorMessage,
	)
}
