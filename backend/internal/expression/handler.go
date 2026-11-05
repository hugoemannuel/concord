package expression

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
)

// resolver: o que o handler usa de Resolver.
type resolver interface {
	Resolve(ctx context.Context, viewerID string, emojiIDs, stickerIDs []string) (ResolvedSet, error)
}

type Handler struct {
	resolver resolver
}

func NewHandler(r resolver) *Handler {
	return &Handler{resolver: r}
}

// Resolve: POST /expressions/resolve {emoji_ids, sticker_ids}.
func (h *Handler) Resolve(c *gin.Context) {
	var input struct {
		EmojiIDs   []string `json:"emoji_ids"`
		StickerIDs []string `json:"sticker_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || len(input.EmojiIDs) > MaxResolve || len(input.StickerIDs) > MaxResolve {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	set, err := h.resolver.Resolve(c.Request.Context(), c.GetString("userID"), input.EmojiIDs, input.StickerIDs)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to resolve"})
		return
	}
	c.JSON(http.StatusOK, set)
}

func Routes(router *gin.RouterGroup, h *Handler, authMiddleware gin.HandlerFunc) {
	router.POST("/expressions/resolve", authMiddleware, h.Resolve)
}
