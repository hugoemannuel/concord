package enquete

import (
	"context"
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

type enqueteSource interface {
	Pendentes(ctx context.Context, userID string) ([]Enquete, error)
	Responder(ctx context.Context, userID, enqueteID, opcaoID string) (Resposta, error)
}

type Handler struct {
	service enqueteSource
}

func EnqueteHandler(service *Service) *Handler {
	return &Handler{service: service}
}

type respostaRequest struct {
	Opcao string `json:"opcao"`
}

// falha traduz o erro de domínio em status HTTP.
func falha(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrOpcaoInvalida):
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid option"})
	case errors.Is(err, ErrNaoElegivel):
		c.JSON(http.StatusForbidden, gin.H{"error": "not eligible"})
	case errors.Is(err, ErrJaRespondeu):
		c.JSON(http.StatusConflict, gin.H{"error": "already answered"})
	case errors.Is(err, ErrEnqueteInexistente):
		c.JSON(http.StatusNotFound, gin.H{"error": "poll not found"})
	case errors.Is(err, ErrUsuarioNaoEncontrado):
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
	default:
		log.Printf("[enquete] %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to process"})
	}
}

// Get: GET /users/me/enquetes, as enquetes que a pessoa pode e ainda não respondeu.
func (h *Handler) Get(c *gin.Context) {
	id, ok := authctx.UserID(c)
	if !ok {
		return
	}
	pendentes, err := h.service.Pendentes(c.Request.Context(), id)
	if err != nil {
		falha(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"enquetes": pendentes})
}

// Post: POST /users/me/enquetes/:id {"opcao": "l"}. Resposta única.
func (h *Handler) Post(c *gin.Context) {
	id, ok := authctx.UserID(c)
	if !ok {
		return
	}
	var req respostaRequest
	if err := c.ShouldBindJSON(&req); err != nil || req.Opcao == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "opcao is required"})
		return
	}
	res, err := h.service.Responder(c.Request.Context(), id, c.Param("id"), req.Opcao)
	if err != nil {
		falha(c, err)
		return
	}
	c.JSON(http.StatusOK, res)
}
