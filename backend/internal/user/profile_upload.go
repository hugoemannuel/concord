package user

import (
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/platform/media"

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
	reader, err := media.OpenUpload(c.Writer, c.Request, h.space, media.UploadSpec{Limit: limit, Room: limit, Cap: true})
	if err != nil {
		respondSaveError(c, err)
		return
	}
	up := &profileUpload{h: h, id: uuid.NewString()}
	defer up.cleanup()
	if err := up.read(reader); err != nil {
		respondSaveError(c, err)
		return
	}
	animated, status, msg := up.check()
	if status != 0 {
		c.JSON(status, gin.H{"error": msg})
		return
	}
	url := profileMediaURL(up.id, animated)
	old, ok := apply(c.Request.Context(), userID, &url)
	if !ok {
		return
	}
	up.keep = true
	up.keepStatic = animated // imagem parada não precisa de quadro estático
	h.removeMedia(old)
}

func respondSaveError(c *gin.Context, err error) {
	status, msg := saveStatus(err)
	c.JSON(status, gin.H{"error": msg})
}

// profileUpload: o arquivo ("file") e o quadro parado ("static") de um
// upload de imagem, salvos com o mesmo id em h.store e h.static.
type profileUpload struct {
	h                    *ProfileHandler
	id                   string
	fileHead, staticHead []byte
	hasFile, hasStatic   bool
	keep, keepStatic     bool
}

// cleanup apaga do disco o que foi salvo e não ficou em uso.
func (u *profileUpload) cleanup() {
	if u.hasFile && !u.keep {
		u.h.removeFile(u.h.store, u.id)
	}
	if u.hasStatic && !u.keepStatic {
		u.h.removeFile(u.h.static, u.id)
	}
}

// read salva as partes "file" e "static"; as outras são descartadas.
func (u *profileUpload) read(r *multipart.Reader) error {
	for {
		part, err := r.NextPart()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		err = u.savePart(part)
		part.Close()
		if err != nil {
			return err
		}
	}
}

func (u *profileUpload) savePart(part *multipart.Part) error {
	store, done, head := u.h.store, &u.hasFile, &u.fileHead
	switch part.FormName() {
	case "file":
	case "static":
		store, done, head = u.h.static, &u.hasStatic, &u.staticHead
	default:
		_, _ = io.Copy(io.Discard, part)
		return nil
	}
	if *done {
		return media.ErrBadForm
	}
	var err error
	if _, *head, err = store.Save(u.id, part, u.h.maxBytes); err != nil {
		return err
	}
	*done = true
	return nil
}

// check confere os tipos: devolve se a imagem é animada (GIF) ou o status e
// a mensagem da recusa.
func (u *profileUpload) check() (animated bool, status int, msg string) {
	if !u.hasFile {
		return false, http.StatusBadRequest, "invalid upload"
	}
	contentType, ok := sniffImage(u.fileHead, profileImageTypes)
	if !ok {
		return false, http.StatusUnsupportedMediaType, "unsupported file type"
	}
	animated = contentType == "image/gif"
	if u.hasStatic && animated {
		if _, ok := sniffImage(u.staticHead, profileStaticTypes); !ok {
			return false, http.StatusUnsupportedMediaType, "unsupported file type"
		}
	}
	return animated, 0, ""
}
