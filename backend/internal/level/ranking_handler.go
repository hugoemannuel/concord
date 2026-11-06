package level

import (
	"net/http"
	"strconv"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

type RankingHandler struct {
	service *RankingService
}

func LevelRankingHandler(service *RankingService) *RankingHandler {
	return &RankingHandler{service: service}
}

// Get devolve o ranking global: GET /levels/ranking?limit=100.
func (h *RankingHandler) Get(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	limit, _ := strconv.Atoi(c.Query("limit"))

	ranking, err := h.service.Get(c.Request.Context(), userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load ranking"})
		return
	}
	if ranking.Entries == nil {
		ranking.Entries = []RankingEntry{}
	}
	c.JSON(http.StatusOK, ranking)
}
