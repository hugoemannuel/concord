package auth

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// bearerClaims lê e valida o "Authorization: Bearer <token>". Sem cabeçalho,
// fora do formato ou token inválido: responde 401 e devolve nil.
func bearerClaims(c *gin.Context, service *Service) *Claims {
	authHeader := c.GetHeader("Authorization")
	if authHeader == "" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "authorization header required"})
		return nil
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || parts[0] != "Bearer" {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
		return nil
	}
	claims, err := service.ValidateToken(parts[1])
	if err != nil {
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
		return nil
	}
	return claims
}

// refuseGuest: o visitante não abre rotas comuns. 403 (e não 401) para o app
// não tentar renovar a sessão, que o visitante não tem.
func refuseGuest(c *gin.Context) {
	c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "visitantes só têm acesso à call", "code": "guest_forbidden"})
}

func AuthMiddleware(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := bearerClaims(c, service)
		switch {
		case claims == nil:
			return
		case claims.Type == TokenGuest:
			refuseGuest(c)
			return
		case claims.Type != "access":
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token is not an access token"})
			return
		case !sessionValid(c, service, claims):
			return
		}
		c.Set("userID", claims.UserID)
		c.Next()
	}
}

// sessionValid confere a versão da sessão (docs/adr/0039). Revogada: 401 (o
// app tenta renovar e, sem refresh token, volta ao login). Banco fora: 503,
// para ninguém ser deslogado por uma falha nossa. false = já respondeu.
func sessionValid(c *gin.Context, service *Service, claims *Claims) bool {
	err := service.CheckSession(c.Request.Context(), claims)
	switch {
	case err == nil:
		return true
	case errors.Is(err, ErrSessionRevoked):
		c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "sessão encerrada", "code": "session_revoked"})
	default:
		c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "tente de novo"})
	}
	return false
}

// MemberOrGuestMiddleware: rotas da call, que valem para quem tem conta e para
// o visitante sem conta. Põe "guest" = true no contexto do visitante; o escopo
// (só a call dele) é conferido por quem atende a rota.
func MemberOrGuestMiddleware(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims := bearerClaims(c, service)
		if claims == nil {
			return
		}
		if claims.Type != "access" && claims.Type != TokenGuest {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "token is not an access token"})
			return
		}
		if !sessionValid(c, service, claims) {
			return
		}
		c.Set("userID", claims.UserID)
		c.Set("guest", claims.Type == TokenGuest)
		c.Next()
	}
}

// OptionalAuthMiddleware: para rotas públicas que mostram um pouco mais a quem
// está logado (prévia do convite). Token de acesso válido põe o userID no
// contexto; sem token, ou com token inválido, segue anônimo (nunca recusa).
func OptionalAuthMiddleware(service *Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		parts := strings.SplitN(c.GetHeader("Authorization"), " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			if claims, err := service.ValidateToken(parts[1]); err == nil && claims.Type == "access" &&
				service.CheckSession(c.Request.Context(), claims) == nil {
				c.Set("userID", claims.UserID)
			}
		}
		c.Next()
	}
}
