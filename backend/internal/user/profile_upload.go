package user

import (
	"context"
	"errors"
	"io"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// Folga para os cabeçalhos do multipart.
const profileMultipartOverhead = 1 << 20

// ImageApply grava a URL nova onde ela vai (perfil, ícone do grupo...) e
// responde ao app. Devolve a URL antiga (para apagar) e se deu certo.
type ImageApply func(ctx context.Context, userID string, url *string) (old *string, ok bool)

// UploadImage recebe "file" (png/jpeg/gif/webp) e, para GIF, "static" (o
// primeiro quadro, gerado pelo app) e passa a URL para apply. Qualquer erro
// apaga o que já foi para o disco.
func (h *ProfileHandler) UploadImage(c *gin.Context, apply ImageApply) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}

	limit := 2*h.maxBytes + profileMultipartOverhead
	incoming := c.Request.ContentLength
	if incoming < 0 {
		incoming = limit
	}
	if !h.space.HasRoom(incoming) {
		c.JSON(http.StatusInsufficientStorage, gin.H{"error": "server out of space"})
		return
	}
	if c.Request.ContentLength > limit {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": "file too large"})
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, limit)

	reader, err := c.Request.MultipartReader()
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
		return
	}

	id := uuid.NewString()
	var (
		fileHead, staticHead []byte
		hasFile, hasStatic   bool
		keep, keepStatic     bool
	)
	defer func() {
		if hasFile && !keep {
			h.removeFile(h.store, id)
		}
		if hasStatic && !keepStatic {
			h.removeFile(h.static, id)
		}
	}()

	for {
		part, err := reader.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			status, msg := saveStatus(err)
			c.JSON(status, gin.H{"error": msg})
			return
		}
		switch part.FormName() {
		case "file", "static":
			store, done, head := h.store, &hasFile, &fileHead
			if part.FormName() == "static" {
				store, done, head = h.static, &hasStatic, &staticHead
			}
			if *done {
				c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
				return
			}
			_, *head, err = store.Save(id, part, h.maxBytes)
			if err != nil {
				status, msg := saveStatus(err)
				c.JSON(status, gin.H{"error": msg})
				return
			}
			*done = true
		default:
			io.Copy(io.Discard, part)
		}
		part.Close()
	}

	if !hasFile {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid upload"})
		return
	}
	contentType, ok := sniffImage(fileHead, profileImageTypes)
	if !ok {
		c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported file type"})
		return
	}
	animated := contentType == "image/gif"
	if hasStatic && animated {
		if _, ok := sniffImage(staticHead, profileStaticTypes); !ok {
			c.JSON(http.StatusUnsupportedMediaType, gin.H{"error": "unsupported file type"})
			return
		}
	}

	url := profileMediaURL(id, animated)
	old, ok := apply(c.Request.Context(), userID, &url)
	if !ok {
		return
	}
	keep = true
	keepStatic = animated // imagem parada não precisa de quadro estático
	h.removeMedia(old)
}
