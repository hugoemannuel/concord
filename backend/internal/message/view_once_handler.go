package message

import (
	"context"
	"errors"
	"log"
	"net/http"
	"time"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// ViewOnceOpener abre uma mídia de visualização única (ViewOnceService.Open).
type ViewOnceOpener interface {
	Open(ctx context.Context, attachmentID, userID string) (string, time.Time, error)
}

// ViewOnceHandler serve POST /attachments/:id/open.
type ViewOnceHandler struct{ opener ViewOnceOpener }

func NewViewOnceHandler(opener ViewOnceOpener) *ViewOnceHandler {
	return &ViewOnceHandler{opener: opener}
}

// Open devolve o token que abre o arquivo (uma vez por destinatário).
func (h *ViewOnceHandler) Open(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "attachment not found"})
		return
	}
	token, expiresAt, err := h.opener.Open(c.Request.Context(), id, userID)
	if err != nil {
		status, msg := openErrorStatus(err)
		if status == http.StatusInternalServerError {
			log.Printf("view_once: abrir anexo %s: %v", id, err)
		}
		c.JSON(status, gin.H{"error": msg})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": token, "expires_at": expiresAt.UTC().Format(time.RFC3339)})
}

// openErrorStatus: sem acesso à sala é 404 (como o arquivo), para não dizer
// que o anexo existe.
func openErrorStatus(err error) (int, string) {
	switch {
	case errors.Is(err, ErrViewOnceForbidden):
		return http.StatusForbidden, "not allowed to open"
	case errors.Is(err, ErrViewOnceGone):
		return http.StatusGone, "already viewed"
	case errors.Is(err, ErrAttachmentNotFound), errors.Is(err, ErrRoomNotFound), errors.Is(err, ErrNoRoomAccess):
		return http.StatusNotFound, "attachment not found"
	default:
		return http.StatusInternalServerError, "failed to open"
	}
}
