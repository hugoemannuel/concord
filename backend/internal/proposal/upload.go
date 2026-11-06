package proposal

import (
	"errors"
	"log"
	"net/http"
	"syscall"

	"github.com/gin-gonic/gin"

	"gin-quickstart/backend/internal/platform/media"
)

// multipartOverhead é a folga do multipart (cabeçalhos das partes) sobre o
// limite do arquivo.
const multipartOverhead = 1 << 20

// maxUploadField: os campos numéricos dos anexos (width, height, duration_ms).
const maxUploadField = 32

// readUpload confere o corpo (espaço em disco e tamanho), salva a parte
// "file" em id e guarda os campos pedidos.
func (h *Handler) readUpload(c *gin.Context, id string, maxFile int64, fields ...string) (media.Form, error) {
	limit := maxFile + multipartOverhead
	reader, err := media.OpenUpload(c.Writer, c.Request, h.space, media.UploadSpec{Limit: limit, Room: limit, Cap: true})
	if err != nil {
		return media.Form{}, err
	}
	return h.images.ReadForm(reader, media.FormSpec{ID: id, MaxFile: maxFile, MaxField: maxUploadField, Fields: fields})
}

func uploadStatus(err error) (int, string) {
	var maxBytes *http.MaxBytesError
	switch {
	case errors.Is(err, media.ErrTooLarge), errors.As(err, &maxBytes):
		return http.StatusRequestEntityTooLarge, "file too large"
	case errors.Is(err, syscall.ENOSPC):
		return http.StatusInsufficientStorage, "server out of space"
	default:
		return http.StatusBadRequest, "invalid upload"
	}
}

func respondUploadError(c *gin.Context, err error) {
	status, msg := uploadStatus(err)
	c.JSON(status, gin.H{"error": msg})
}

// discardUpload apaga o arquivo de um upload recusado.
func (h *Handler) discardUpload(id string) {
	if err := h.images.Remove(id); err != nil {
		log.Printf("[proposal] remove rejected upload %s: %v", id, err)
	}
}
