package user

import (
	"errors"
	"log"
	"net/http"

	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
)

// EntranceSoundHandler sobe, remove e serve o som de entrada. O corpo do POST
// é o próprio arquivo (sem multipart): é um arquivo só, pequeno.
type EntranceSoundHandler struct {
	set      mediaSetter // ProfileService.SetEntranceSound
	store    *media.Store
	space    spaceChecker
	maxBytes int64 // MaxEntranceSoundBytes; testes diminuem
}

func NewEntranceSoundHandler(service *ProfileService, store *media.Store, space spaceChecker) *EntranceSoundHandler {
	return &EntranceSoundHandler{
		set:      service.SetEntranceSound,
		store:    store,
		space:    space,
		maxBytes: MaxEntranceSoundBytes,
	}
}

// Upload: POST /users/me/entrance-sound?duration_ms=N com o áudio no corpo.
func (h *EntranceSoundHandler) Upload(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	if _, err := parseEntranceDuration(c.Query("duration_ms")); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	id, err := h.saveAudio(c.Request)
	if err != nil {
		status, msg := entranceSaveStatus(err)
		c.JSON(status, gin.H{"error": msg})
		return
	}
	url := entranceSoundURL(id)
	u, old, err := h.set(c.Request.Context(), userID, &url)
	if err != nil {
		h.removeFile(id)
		respondProfileError(c, err)
		return
	}
	h.removeURL(old)
	c.JSON(http.StatusOK, u.Self())
}

// Delete volta ao som padrão e apaga o arquivo.
func (h *EntranceSoundHandler) Delete(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	u, old, err := h.set(c.Request.Context(), userID, nil)
	if err != nil {
		respondProfileError(c, err)
		return
	}
	h.removeURL(old)
	c.JSON(http.StatusOK, u.Self())
}

// saveAudio grava o corpo e confere que é áudio (ver media.SaveAudio).
func (h *EntranceSoundHandler) saveAudio(r *http.Request) (string, error) {
	return media.SaveAudio(h.store, h.space, r, h.maxBytes, nil)
}

func entranceSaveStatus(err error) (int, string) {
	if errors.Is(err, media.ErrNotAudio) {
		return http.StatusUnsupportedMediaType, "only audio files (mp3, wav, ogg, m4a, webm) are allowed"
	}
	return saveStatus(err)
}

func (h *EntranceSoundHandler) removeURL(url *string) {
	if id, ok := entranceSoundIDFromURL(url); ok {
		h.removeFile(id)
	}
}

func (h *EntranceSoundHandler) removeFile(id string) {
	if err := h.store.Remove(id); err != nil {
		log.Printf("[profile] failed to remove entrance sound %s: %v", id, err)
	}
}

// Serve entrega o som sem token (ver media.ServeAudio).
func (h *EntranceSoundHandler) Serve(c *gin.Context) {
	id, ok := parseSoundID(c.Param("id"))
	if !ok || !media.ServeAudio(c.Writer, c.Request, h.store, id) {
		c.JSON(http.StatusNotFound, gin.H{"error": "sound not found"})
	}
}
