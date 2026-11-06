package user

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"syscall"

	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/platform/media"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type spaceChecker interface{ HasRoom(incoming int64) bool }

// ProfileHandler edita o perfil e serve avatar/banner. Os arquivos ficam em
// store; o quadro parado de um GIF fica em static com o mesmo nome.
type ProfileHandler struct {
	service  *ProfileService
	store    *media.Store
	static   *media.Store
	space    spaceChecker
	maxBytes int64 // MaxProfileImageBytes; testes diminuem
	// keeper: quem mais usa a mídia (perfis salvos). Nil = ninguém.
	keeper MediaKeeper
}

func NewProfileHandler(service *ProfileService, store, static *media.Store, space spaceChecker) *ProfileHandler {
	return &ProfileHandler{
		service:  service,
		store:    store,
		static:   static,
		space:    space,
		maxBytes: MaxProfileImageBytes,
	}
}

func respondProfileError(c *gin.Context, err error) {
	switch {
	case errors.Is(err, ErrInvalidProfile), errors.Is(err, ErrInvalidStatus):
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
	case errors.Is(err, ErrUserNotFound):
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
	default:
		log.Printf("[profile] %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile"})
	}
}

// GetProfile devolve o cartão de perfil de alguém.
func (h *ProfileHandler) GetProfile(c *gin.Context) {
	viewerID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	id := c.Param("id")
	if _, err := uuid.Parse(id); err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	profile, err := h.service.Profile(c.Request.Context(), viewerID, id)
	if err != nil {
		respondProfileError(c, err)
		return
	}
	c.JSON(http.StatusOK, profile)
}

func (h *ProfileHandler) UpdateProfile(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	var input ProfileInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	u, err := h.service.UpdateProfile(c.Request.Context(), userID, input)
	if err != nil {
		respondProfileError(c, err)
		return
	}
	c.JSON(http.StatusOK, u.Self())
}

func (h *ProfileHandler) SetStatus(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	var input struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	u, err := h.service.SetStatus(c.Request.Context(), userID, input.Status)
	if err != nil {
		respondProfileError(c, err)
		return
	}
	c.JSON(http.StatusOK, u.Self())
}

func (h *ProfileHandler) UploadAvatar(c *gin.Context) { h.upload(c, h.service.SetAvatar) }
func (h *ProfileHandler) UploadBanner(c *gin.Context) { h.upload(c, h.service.SetBanner) }
func (h *ProfileHandler) DeleteAvatar(c *gin.Context) { h.remove(c, h.service.SetAvatar) }
func (h *ProfileHandler) DeleteBanner(c *gin.Context) { h.remove(c, h.service.SetBanner) }

type mediaSetter func(ctx context.Context, userID string, url *string) (*User, *string, error)

// Tipos aceitos: o arquivo pode ser GIF; o quadro parado, não.
var (
	profileImageTypes  = map[string]bool{"image/png": true, "image/jpeg": true, "image/gif": true, "image/webp": true}
	profileStaticTypes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true}
)

func sniffImage(head []byte, allowed map[string]bool) (string, bool) {
	kind, contentType, ok := media.Sniff(head, "")
	if !ok || kind != media.KindImage || !allowed[contentType] {
		return "", false
	}
	return contentType, true
}

func saveStatus(err error) (int, string) {
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

func (h *ProfileHandler) upload(c *gin.Context, set mediaSetter) {
	h.UploadImage(c, func(ctx context.Context, userID string, url *string) (*string, bool) {
		u, old, err := set(ctx, userID, url)
		if err != nil {
			respondProfileError(c, err)
			return nil, false
		}
		c.JSON(http.StatusOK, u.Self())
		return old, true
	})
}

// RemoveMediaURL apaga o arquivo de uma URL que deixou de ser usada.
func (h *ProfileHandler) RemoveMediaURL(url *string) {
	h.removeMedia(url)
}

func (h *ProfileHandler) remove(c *gin.Context, set mediaSetter) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	u, old, err := set(c.Request.Context(), userID, nil)
	if err != nil {
		respondProfileError(c, err)
		return
	}
	h.removeMedia(old)
	c.JSON(http.StatusOK, u.Self())
}

// removeMedia apaga o arquivo (e o quadro parado) de uma URL antiga.
func (h *ProfileHandler) removeMedia(url *string) {
	id, ok := mediaIDFromURL(url)
	if !ok || h.inUse(*url) {
		return
	}
	h.removeFile(h.store, id)
	h.removeFile(h.static, id)
}

func (h *ProfileHandler) removeFile(store *media.Store, id string) {
	if err := store.Remove(id); err != nil {
		log.Printf("[profile] failed to remove media %s: %v", id, err)
	}
}

func (h *ProfileHandler) ServeMedia(c *gin.Context)       { h.serve(c, false) }
func (h *ProfileHandler) ServeStaticMedia(c *gin.Context) { h.serve(c, true) }

// serve entrega avatar/banner sem token: <img> não manda Bearer e o nome é um
// UUID novo a cada upload (não dá para adivinhar e pode ficar em cache para
// sempre). /static entrega o quadro parado do GIF, ou o próprio arquivo quando
// a imagem não anima.
func (h *ProfileHandler) serve(c *gin.Context, wantStatic bool) {
	notFound := func() { c.JSON(http.StatusNotFound, gin.H{"error": "media not found"}) }

	id, ok := parseMediaID(c.Param("id"))
	if !ok {
		notFound()
		return
	}

	allowed := profileImageTypes
	file, err := h.store.Open(id)
	if wantStatic {
		if staticFile, staticErr := h.static.Open(id); staticErr == nil {
			if file != nil {
				file.Close()
			}
			file, err, allowed = staticFile, nil, profileStaticTypes
		}
	}
	if err != nil {
		notFound()
		return
	}
	defer file.Close()

	head := make([]byte, media.SniffLen)
	n, _ := io.ReadFull(file, head)
	contentType, ok := sniffImage(head[:n], allowed)
	if !ok {
		notFound()
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		notFound()
		return
	}
	info, err := file.Stat()
	if err != nil {
		notFound()
		return
	}

	header := c.Writer.Header()
	header.Set("Content-Type", contentType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Cache-Control", "public, max-age=31536000, immutable")
	if contentType == "image/gif" && info.Size() <= maxGIFRewrite {
		// GIF com repetição finita congela no fim: força repetir para sempre.
		if data, err := io.ReadAll(file); err == nil {
			http.ServeContent(c.Writer, c.Request, "", info.ModTime(), bytes.NewReader(loopForever(data)))
			return
		}
		if _, err := file.Seek(0, io.SeekStart); err != nil {
			notFound()
			return
		}
	}
	http.ServeContent(c.Writer, c.Request, "", info.ModTime(), file)
}

// maxGIFRewrite limita o GIF lido na memória para ajustar a repetição.
const maxGIFRewrite = 16 << 20
