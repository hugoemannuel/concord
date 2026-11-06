package ratelimit

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// ByIP: no máximo o limite do limiter por IP (IPv6 por /64); passou, 429 com
// Retry-After e message no corpo.
func ByIP(limiter *Limiter, message string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if retry, ok := limiter.Allow(IPKey(c.ClientIP())); !ok {
			c.Header("Retry-After", RetryAfterSeconds(retry))
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": message})
			return
		}
		c.Next()
	}
}
