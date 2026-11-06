package memberprofile

import (
	"context"
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Images é o pedaço do user.ProfileHandler usado aqui: o mesmo upload do avatar
// global (GIF com quadro parado, limites, tipos) e a limpeza por referência.
type Images interface {
	UploadImage(c *gin.Context, apply user.ImageApply)
	MediaRemover
}

// Handler expõe o perfil do servidor de quem está logado.
type Handler struct {
	service *Service
	images  Images
}

func NewHandler(service *Service, images Images) *Handler {
	return &Handler{service: service, images: images}
}

func respondError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrNotMember):
		c.JSON(http.StatusForbidden, gin.H{"error": "not a member"})
	case errors.Is(err, user.ErrInvalidProfile):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	default:
		log.Printf("[memberprofile] %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update server profile"})
	}
}

// target: o servidor da rota e quem está logado. Id que não é UUID é o mesmo
// que um servidor de que a pessoa não faz parte.
func target(c *gin.Context) (serverID, userID string, ok bool) {
	userID, ok = authctx.UserID(c)
	if !ok {
		return "", "", false
	}
	serverID = c.Param("id")
	if _, err := uuid.Parse(serverID); err != nil {
		respondError(c, ErrNotMember)
		return "", "", false
	}
	return serverID, userID, true
}

// Get: GET /servers/:id/my-profile.
func (h *Handler) Get(c *gin.Context) {
	serverID, userID, ok := target(c)
	if !ok {
		return
	}
	view, err := h.service.View(c.Request.Context(), serverID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// Update: PATCH /servers/:id/my-profile. Campo ausente não muda, null volta ao
// padrão e valor sobrescreve.
func (h *Handler) Update(c *gin.Context) {
	serverID, userID, ok := target(c)
	if !ok {
		return
	}
	var patch Patch
	if err := c.ShouldBindJSON(&patch); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	view, err := h.service.Update(c.Request.Context(), serverID, userID, patch)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// Delete: DELETE /servers/:id/my-profile.
func (h *Handler) Delete(c *gin.Context) {
	serverID, userID, ok := target(c)
	if !ok {
		return
	}
	view, err := h.service.Delete(c.Request.Context(), serverID, userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, view)
}

// upload: POST /servers/:id/my-profile/<kind>. Membro confere antes de o arquivo
// ir para o disco.
func (h *Handler) upload(kind MediaKind) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverID, userID, ok := target(c)
		if !ok {
			return
		}
		if err := h.service.RequireMember(c.Request.Context(), serverID, userID); err != nil {
			respondError(c, err)
			return
		}
		h.images.UploadImage(c, func(ctx context.Context, userID string, url *string) (*string, bool) {
			view, old, err := h.service.SetMedia(ctx, serverID, userID, kind, url)
			if err != nil {
				respondError(c, err)
				return nil, false
			}
			c.JSON(http.StatusOK, view)
			return old, true
		})
	}
}

// reset: DELETE /servers/:id/my-profile/<kind>: a imagem volta a herdar do global.
func (h *Handler) reset(kind MediaKind) gin.HandlerFunc {
	return func(c *gin.Context) {
		serverID, userID, ok := target(c)
		if !ok {
			return
		}
		view, old, err := h.service.SetMedia(c.Request.Context(), serverID, userID, kind, nil)
		if err != nil {
			respondError(c, err)
			return
		}
		h.images.RemoveMediaURL(old)
		c.JSON(http.StatusOK, view)
	}
}
