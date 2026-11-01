package auth

import (
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// Renovar a sessão e sair (docs/adr/0039-revogacao-de-sessao.md).

func (h *Handler) Refresh(c *gin.Context) {
	var input struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	newAccessToken, newRefreshToken, err := h.service.RefreshTokens(c.Request.Context(), input.RefreshToken)
	switch {
	case errors.Is(err, ErrInvalidRefresh), errors.Is(err, ErrSessionRevoked):
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	case err != nil:
		// Falha nossa (banco): 503, para o app tentar de novo em vez de sair.
		log.Printf("[auth] renovar sessão: %v", err)
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "tente de novo"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"access_token":  newAccessToken,
		"refresh_token": newRefreshToken,
	})
}

// Logout: POST /auth/logout {refresh_token?}. Com o token, sai só deste
// dispositivo; sem ele (apps antigos), apaga todos os refresh tokens.
func (h *Handler) Logout(c *gin.Context) {
	var input struct {
		RefreshToken string `json:"refresh_token"`
	}
	// Corpo vazio é o app antigo: sem token.
	_ = c.ShouldBindJSON(&input)
	if err := h.service.Logout(c.Request.Context(), c.GetString("userID"), input.RefreshToken); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to logout"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "logged out"})
}

// LogoutAll: POST /auth/logout-all. Todos os dispositivos saem: os tokens de
// acesso emitidos param de valer na hora e o WebSocket de cada um cai.
func (h *Handler) LogoutAll(c *gin.Context) {
	if err := h.service.RevokeAllSessions(c.Request.Context(), c.GetString("userID")); err != nil {
		log.Printf("[auth] sair de todos os dispositivos: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "não foi possível encerrar as sessões"})
		return
	}
	c.Status(http.StatusNoContent)
}
