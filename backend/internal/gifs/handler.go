package gifs

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func NewHandler(cfg Config) *Handler {
	return &Handler{service: NewService(cfg)}
}

func unavailable(c *gin.Context) {
	c.JSON(http.StatusServiceUnavailable, gin.H{"error": "gifs_unavailable"})
}

// clientConfig é o que o app precisa para chamar a KLIPY direto (a KLIPY exige
// que as chamadas saiam do aparelho de quem usa). A chave é a do app, feita
// para ficar no cliente; o customer_id é o hash da pessoa, nunca o id real.
type clientConfig struct {
	Provider      string `json:"provider"`
	AppKey        string `json:"app_key"`
	CustomerID    string `json:"customer_id"`
	Locale        string `json:"locale"`
	ContentFilter string `json:"content_filter"`
	FormatFilter  string `json:"format_filter"`
}

// Config: GET /gifs/config. 503 sem KLIPY_API_KEY (o app mostra "GIFs indisponíveis").
func (h *Handler) Config(c *gin.Context) {
	if !h.service.Available() {
		unavailable(c)
		return
	}
	id := userIDOf(c)
	c.JSON(http.StatusOK, clientConfig{
		Provider:      ProviderKlipy,
		AppKey:        h.service.appKey,
		CustomerID:    h.service.CustomerID(id),
		Locale:        klipyLocale,
		ContentFilter: klipyContentFilter,
		FormatFilter:  klipyFormatFilter,
	})
}

func userIDOf(c *gin.Context) string {
	v, _ := c.Get("userID")
	id, _ := v.(string)
	return id
}

func pageParams(c *gin.Context) (limit, offset int) {
	limit, _ = strconv.Atoi(c.DefaultQuery("limit", "25"))
	offset, _ = strconv.Atoi(c.DefaultQuery("offset", "0"))
	return limit, offset
}

func (h *Handler) respond(c *gin.Context, items []GIFItem, err error) {
	if err != nil {
		unavailable(c)
		return
	}
	c.JSON(http.StatusOK, items)
}

// Trending e Search: o proxy dos apps antigos (só com KLIPY_PROXY_SERVIDOR=1).
func (h *Handler) Trending(c *gin.Context) {
	if !h.service.ProxyEnabled() {
		unavailable(c)
		return
	}
	limit, offset := pageParams(c)
	id := userIDOf(c)
	items, err := h.service.Trending(c.Request.Context(), id, limit, offset)
	h.respond(c, items, err)
}

func (h *Handler) Search(c *gin.Context) {
	query := strings.TrimSpace(c.Query("q"))
	if query == "" {
		h.Trending(c)
		return
	}
	if !h.service.ProxyEnabled() {
		unavailable(c)
		return
	}
	limit, offset := pageParams(c)
	id := userIDOf(c)
	items, err := h.service.Search(c.Request.Context(), id, query, limit, offset)
	h.respond(c, items, err)
}

func Routes(router *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc) {
	g := router.Group("/gifs")
	g.Use(authMiddleware)
	{
		g.GET("/config", h.Config)
		g.GET("/trending", h.Trending)
		g.GET("/search", h.Search)
	}
}
