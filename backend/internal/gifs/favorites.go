package gifs

import (
	"context"
	"errors"
	"net/http"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

// MaxFavoritesPerUser limita quantos GIFs cada pessoa favorita.
const MaxFavoritesPerUser = 200

var (
	ErrFavoritesFull = errors.New("limite de GIFs favoritos atingido")
	errInvalidGIF    = errors.New("invalid gif")
)

const (
	maxIDLen    = 128
	maxTitleLen = 200
	maxSide     = 10000
)

// favoriteRepo guarda os GIFs favoritos de cada pessoa (Repository).
type favoriteRepo interface {
	ListFavorites(ctx context.Context, userID string) ([]GIFItem, error)
	AddFavorite(ctx context.Context, userID string, gif GIFItem, max int) error
	RemoveFavorite(ctx context.Context, userID, gifID string) error
}

// FavoritesHandler: a estrela nos GIFs. O favorito é da pessoa (não de
// servidor) e guarda o que o seletor precisa para mostrar e enviar o GIF sem
// nova busca (a KLIPY, ou o GIPHY nos favoritos antigos).
type FavoritesHandler struct {
	favorites favoriteRepo
	max       int
}

func NewFavoritesHandler(favorites favoriteRepo) *FavoritesHandler {
	return &FavoritesHandler{favorites: favorites, max: MaxFavoritesPerUser}
}

func FavoriteRoutes(router *gin.RouterGroup, h *FavoritesHandler, authMiddleware gin.HandlerFunc) {
	favs := router.Group("/users/me/gif-favorites")
	favs.Use(authMiddleware)
	{
		favs.GET("", h.List)
		favs.PUT("/:gifId", h.Add)
		favs.DELETE("/:gifId", h.Remove)
	}
}

func currentUser(c *gin.Context) (string, bool) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return "", false
	}
	return userID.(string), true
}

func (h *FavoritesHandler) List(c *gin.Context) {
	if userID, ok := currentUser(c); ok {
		h.respondList(c, userID)
	}
}

// Add favorita e responde com a lista nova. Favoritar de novo só atualiza.
func (h *FavoritesHandler) Add(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var gif GIFItem
	if err := c.ShouldBindJSON(&gif); err != nil || gif.ID != c.Param("gifId") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid gif"})
		return
	}
	if err := validateGIF(&gif); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	err := h.favorites.AddFavorite(c.Request.Context(), userID, gif, h.max)
	if errors.Is(err, ErrFavoritesFull) {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save favorite"})
		return
	}
	h.respondList(c, userID)
}

// Remove tira dos favoritos (o que não estava não é erro) e responde com a
// lista nova.
func (h *FavoritesHandler) Remove(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	if err := h.favorites.RemoveFavorite(c.Request.Context(), userID, c.Param("gifId")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove favorite"})
		return
	}
	h.respondList(c, userID)
}

func (h *FavoritesHandler) respondList(c *gin.Context, userID string) {
	gifs, err := h.favorites.ListFavorites(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list favorites"})
		return
	}
	c.JSON(http.StatusOK, gifs)
}

// validateGIF: o cliente manda os dados do GIF, então só aceita o que os
// provedores servem (URL https de giphy.com ou klipy.com, e a prévia do mesmo
// provedor) e tamanhos plausíveis; o título é cortado em vez de recusado. O
// provedor vem da URL, não do que o cliente disser (apps antigos nem mandam).
func validateGIF(gif *GIFItem) error {
	provider := providerOf(gif.URL)
	if gif.ID == "" || len(gif.ID) > maxIDLen || provider == "" {
		return errInvalidGIF
	}
	if gif.PreviewURL != "" && providerOf(gif.PreviewURL) != provider {
		return errInvalidGIF
	}
	if gif.Width < 0 || gif.Width > maxSide || gif.Height < 0 || gif.Height > maxSide {
		return errInvalidGIF
	}
	gif.Provider = provider
	gif.Title = truncateRunes(gif.Title, maxTitleLen)
	return nil
}

func truncateRunes(s string, max int) string {
	if utf8.RuneCountInString(s) <= max {
		return s
	}
	return string([]rune(s)[:max])
}
