package musiclinks

import (
	"net/http"
	"strings"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
)

type Handler struct{ s *Service }

func NewHandler(s *Service) *Handler { return &Handler{s: s} }

// Links: GET /music/links?artist=&title= → {"links": {"deezer": "https://..."}}.
// Serviço que não está na resposta usa o link de busca no cliente.
func (h *Handler) Links(c *gin.Context) {
	q := Query{Artist: strings.TrimSpace(c.Query("artist")), Title: strings.TrimSpace(c.Query("title"))}
	if !validQuery(q) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"links": h.s.Links(c.Request.Context(), q)})
}

func validQuery(q Query) bool {
	return q.Title != "" && utf8.RuneCountInString(q.Title) <= queryMax && utf8.RuneCountInString(q.Artist) <= queryMax
}
