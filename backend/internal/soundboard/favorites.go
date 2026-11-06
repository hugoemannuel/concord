package soundboard

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// favoriteRepo guarda os sons favoritos de cada pessoa (Repository).
type favoriteRepo interface {
	ListFavorites(ctx context.Context, userID string) ([]FavoriteSound, error)
	AddFavorite(ctx context.Context, userID, soundID string, max int) error
	RemoveFavorite(ctx context.Context, userID, soundID string) error
}

type soundFinder interface {
	FindByID(ctx context.Context, id string) (*Sound, error)
}

// FavoritesHandler: a estrela nos sons. O favorito é da pessoa e vale em
// chamadas de qualquer servidor; favoritar pede ser membro do servidor do som
// (é onde ela o vê), mas usar depois não.
type FavoritesHandler struct {
	favorites favoriteRepo
	sounds    soundFinder
	servers   serverChecker
	max       int
}

func NewFavoritesHandler(favorites favoriteRepo, sounds soundFinder, servers serverChecker) *FavoritesHandler {
	return &FavoritesHandler{favorites: favorites, sounds: sounds, servers: servers, max: MaxFavoritesPerUser}
}

func FavoriteRoutes(router *gin.RouterGroup, h *FavoritesHandler, authMiddleware gin.HandlerFunc) {
	favs := router.Group("/users/me/soundboard-favorites")
	favs.Use(authMiddleware)
	{
		favs.GET("", h.List)
		favs.PUT("/:soundId", h.Add)
		favs.DELETE("/:soundId", h.Remove)
	}
}

func (h *FavoritesHandler) List(c *gin.Context) {
	if userID, ok := authctx.UserID(c); ok {
		h.respondList(c, userID)
	}
}

// Add favorita e responde com a lista nova.
func (h *FavoritesHandler) Add(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	ctx := c.Request.Context()
	if e := h.checkVisible(ctx, userID, c.Param("soundId")); e != nil {
		c.JSON(e.status, e.body)
		return
	}
	err := h.favorites.AddFavorite(ctx, userID, c.Param("soundId"), h.max)
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

// Remove tira dos favoritos (mesmo de servidor de que já saiu) e responde com
// a lista nova.
func (h *FavoritesHandler) Remove(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.favorites.RemoveFavorite(c.Request.Context(), userID, c.Param("soundId")); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove favorite"})
		return
	}
	h.respondList(c, userID)
}

// checkVisible: o som existe e a pessoa é membro do servidor dele. Som de
// outro servidor responde como inexistente, para não vazar.
func (h *FavoritesHandler) checkVisible(ctx context.Context, userID, soundID string) *apiErr {
	sound, err := h.sounds.FindByID(ctx, soundID)
	if errors.Is(err, ErrSoundNotFound) {
		return fail(http.StatusNotFound, ErrSoundNotFound.Error())
	}
	if err != nil {
		return fail(http.StatusInternalServerError, "failed to load sound")
	}
	isMember, err := h.servers.IsMember(ctx, sound.ServerID, userID)
	if err != nil {
		return fail(http.StatusInternalServerError, "failed to check membership")
	}
	if !isMember {
		return fail(http.StatusNotFound, ErrSoundNotFound.Error())
	}
	return nil
}

func (h *FavoritesHandler) respondList(c *gin.Context, userID string) {
	favs, err := h.favorites.ListFavorites(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to list favorites"})
		return
	}
	c.JSON(http.StatusOK, favs)
}
