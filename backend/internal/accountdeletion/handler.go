package accountdeletion

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

const maxBodyBytes = 4 << 10

// passwordConfirmer confere a senha atual (auth.AccountHandler: limite de
// tentativas e as vagas do bcrypt do login). false = já respondeu.
type passwordConfirmer interface {
	ConfirmPassword(c *gin.Context, password string) (string, bool)
}

type deleter interface {
	Delete(ctx context.Context, userID string) error
}

type Handler struct {
	confirm passwordConfirmer
	service deleter
}

func NewHandler(confirm passwordConfirmer, service deleter) *Handler {
	return &Handler{confirm: confirm, service: service}
}

type deleteRequest struct {
	Password string `json:"password"`
	// Confirm: a pessoa marcou que entende que não dá para desfazer.
	Confirm bool `json:"confirm"`
}

// DeleteMe: POST /users/me/delete {password, confirm: true}. 204 = conta
// excluída; 409 owns_servers = transfira ou apague os servidores listados.
func (h *Handler) DeleteMe(c *gin.Context) {
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxBodyBytes)
	var in deleteRequest
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "pedido inválido"})
		return
	}
	if !in.Confirm {
		c.JSON(http.StatusBadRequest, gin.H{"error": "confirme que quer excluir a conta", "code": "confirm_required"})
		return
	}
	userID, ok := h.confirm.ConfirmPassword(c, in.Password)
	if !ok {
		return
	}
	respond(c, h.service.Delete(c.Request.Context(), userID))
}

func respond(c *gin.Context, err error) {
	var owns *OwnsServersError
	switch {
	case err == nil:
		c.Status(http.StatusNoContent)
	case errors.As(err, &owns):
		c.JSON(http.StatusConflict, gin.H{"error": err.Error(), "code": "owns_servers", "servers": owns.Servers})
	case errors.Is(err, ErrNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	default:
		log.Printf("[conta] excluir: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "não foi possível excluir a conta"})
	}
}

// Routes: POST /users/me/delete (autenticada).
func Routes(api *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc) {
	api.POST("/users/me/delete", authMiddleware, h.DeleteMe)
}
