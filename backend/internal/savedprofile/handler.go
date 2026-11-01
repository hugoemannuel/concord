package savedprofile

import (
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// mediaRemover apaga o arquivo de uma URL de mídia do perfil que ninguém
// mais usa (user.ProfileHandler confere os perfis salvos antes de apagar).
type mediaRemover interface {
	RemoveMediaURL(url *string)
}

type Handler struct {
	service *Service
	media   mediaRemover
	notify  userNotifier
}

func NewHandler(service *Service, media mediaRemover, notify userNotifier) *Handler {
	return &Handler{service: service, media: media, notify: notify}
}

// errorStatus: erro de domínio → status HTTP (0 = erro inesperado).
func errorStatus(err error) int {
	switch {
	case errors.Is(err, ErrInvalidName), errors.Is(err, user.ErrInvalidProfile):
		return http.StatusBadRequest
	case errors.Is(err, ErrNotFound), errors.Is(err, user.ErrUserNotFound):
		return http.StatusNotFound
	case errors.Is(err, ErrNameTaken), errors.Is(err, ErrLimit):
		return http.StatusConflict
	}
	return 0
}

func fail(c *gin.Context, err error) {
	if status := errorStatus(err); status != 0 {
		c.JSON(status, gin.H{"error": err.Error()})
		return
	}
	log.Printf("[savedprofile] %v", err)
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error"})
}

// changed avisa os aparelhos da pessoa que a lista de perfis salvos mudou.
func (h *Handler) changed(c *gin.Context) {
	notifyChanged(h.notify, c.GetString("userID"))
}

func savedID(c *gin.Context) (string, bool) {
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": ErrNotFound.Error()})
		return "", false
	}
	return id, true
}

type nameInput struct {
	Name string `json:"name"`
}

func bindName(c *gin.Context) (string, bool) {
	var in nameInput
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return "", false
	}
	return in.Name, true
}

// List: GET /users/me/saved-profiles
func (h *Handler) List(c *gin.Context) {
	list, err := h.service.List(c.Request.Context(), c.GetString("userID"))
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, list)
}

// Create: POST /users/me/saved-profiles {name} salva o perfil atual.
func (h *Handler) Create(c *gin.Context) {
	name, ok := bindName(c)
	if !ok {
		return
	}
	sp, err := h.service.Save(c.Request.Context(), c.GetString("userID"), name)
	if err != nil {
		fail(c, err)
		return
	}
	h.changed(c)
	c.JSON(http.StatusCreated, sp)
}

// Rename: PATCH /users/me/saved-profiles/:id {name}
func (h *Handler) Rename(c *gin.Context) {
	id, ok := savedID(c)
	if !ok {
		return
	}
	name, ok := bindName(c)
	if !ok {
		return
	}
	sp, err := h.service.Rename(c.Request.Context(), c.GetString("userID"), id, name)
	if err != nil {
		fail(c, err)
		return
	}
	h.changed(c)
	c.JSON(http.StatusOK, sp)
}

// Overwrite: PUT /users/me/saved-profiles/:id sobrescreve o perfil salvo com
// o perfil atual, mantendo nome e posição. A mídia que o perfil salvo usava e
// ninguém mais usa sai do disco; a nova vai por referência (ADR 0011).
func (h *Handler) Overwrite(c *gin.Context) {
	id, ok := savedID(c)
	if !ok {
		return
	}
	sp, old, err := h.service.Overwrite(c.Request.Context(), c.GetString("userID"), id)
	if err != nil {
		fail(c, err)
		return
	}
	h.media.RemoveMediaURL(old.AvatarURL)
	h.media.RemoveMediaURL(old.BannerURL)
	h.changed(c)
	c.JSON(http.StatusOK, sp)
}

// Delete: DELETE /users/me/saved-profiles/:id. A mídia que só ele usava sai
// do disco.
func (h *Handler) Delete(c *gin.Context) {
	id, ok := savedID(c)
	if !ok {
		return
	}
	sp, err := h.service.Delete(c.Request.Context(), c.GetString("userID"), id)
	if err != nil {
		fail(c, err)
		return
	}
	h.media.RemoveMediaURL(sp.AvatarURL)
	h.media.RemoveMediaURL(sp.BannerURL)
	h.changed(c)
	c.Status(http.StatusNoContent)
}

// Apply: POST /users/me/saved-profiles/:id/apply troca o perfil atual pelo
// salvo e responde com a conta, como PUT /users/me/profile.
func (h *Handler) Apply(c *gin.Context) {
	id, ok := savedID(c)
	if !ok {
		return
	}
	u, old, err := h.service.Apply(c.Request.Context(), c.GetString("userID"), id)
	if err != nil {
		fail(c, err)
		return
	}
	for _, url := range old {
		h.media.RemoveMediaURL(url)
	}
	h.changed(c)
	c.JSON(http.StatusOK, u.Self())
}
