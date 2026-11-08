package linkpreview

import (
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"time"

	"gin-quickstart/backend/internal/platform/authctx"
	"gin-quickstart/backend/internal/platform/media"
	"gin-quickstart/backend/internal/platform/ratelimit"

	"github.com/gin-gonic/gin"
)

const (
	// previewsPerMinute: buscas novas por usuário (cache acertado não conta).
	previewsPerMinute = 30
	limiterMaxKeys    = 10000
)

type previewSource interface {
	Cached(ctx context.Context, key string) (*Preview, bool, error)
	Fetch(ctx context.Context, key string) (*Preview, error)
}

type imageOpener interface {
	Open(id string) (*os.File, error)
}

type Handler struct {
	previews previewSource
	images   imageOpener
	limiter  *ratelimit.Limiter
}

func NewHandler(previews previewSource, images imageOpener) *Handler {
	return &Handler{
		previews: previews,
		images:   images,
		limiter:  ratelimit.New(previewsPerMinute, time.Minute, limiterMaxKeys),
	}
}

var errRateLimited = errors.New("muitas prévias")

// Get: GET /link-previews?url= → o cartão (200) ou nada (204).
func (h *Handler) Get(c *gin.Context) {
	key, err := NormalizeURL(c.Query("url"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid url"})
		return
	}
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	p, retry, err := h.preview(c.Request.Context(), key, userID)
	switch {
	case errors.Is(err, errRateLimited):
		c.Header("Retry-After", ratelimit.RetryAfterSeconds(retry))
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many link previews"})
	case err != nil:
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load link preview"})
	case p == nil:
		c.Status(http.StatusNoContent)
	default:
		c.Header("Cache-Control", "private, max-age=3600")
		c.JSON(http.StatusOK, p)
	}
}

// preview: do cache; sem cache, conta no limite do usuário e busca.
func (h *Handler) preview(ctx context.Context, key, userID string) (*Preview, time.Duration, error) {
	p, hit, err := h.previews.Cached(ctx, key)
	if err != nil || hit {
		return p, 0, err
	}
	if retry, ok := h.limiter.Allow(userID); !ok {
		return nil, retry, errRateLimited
	}
	p, err = h.previews.Fetch(ctx, key)
	return p, 0, err
}

// Image: GET /link-previews/image/:id, sem login (um <img> não manda
// Authorization). Só serve imagem já baixada: nunca dispara busca, então não
// é proxy aberto; o id é um UUID aleatório, não derivado da URL.
func (h *Handler) Image(c *gin.Context) {
	f, contentType, ok := h.openImage(c.Param("id"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		return
	}
	defer f.Close()
	var modTime time.Time
	if info, err := f.Stat(); err == nil {
		modTime = info.ModTime()
	}
	header := c.Writer.Header()
	header.Set("Content-Type", contentType)
	header.Set("X-Content-Type-Options", "nosniff")
	header.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	header.Set("Cache-Control", "public, max-age=86400")
	http.ServeContent(c.Writer, c.Request, "", modTime, f)
}

// openImage abre o arquivo e confere pelos bytes que é imagem.
func (h *Handler) openImage(id string) (*os.File, string, bool) {
	f, err := h.images.Open(id)
	if err != nil {
		return nil, "", false
	}
	head := make([]byte, media.SniffLen)
	n, _ := io.ReadFull(f, head)
	kind, contentType, ok := media.Sniff(head[:n], "")
	if _, err := f.Seek(0, io.SeekStart); err != nil || !ok || kind != media.KindImage {
		f.Close()
		return nil, "", false
	}
	return f, contentType, true
}
