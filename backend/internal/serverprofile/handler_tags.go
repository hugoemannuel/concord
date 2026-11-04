package serverprofile

import (
	"context"
	"errors"
	"net/http"

	"github.com/gin-gonic/gin"
)

// TagChoices é o que as rotas da tag usam (Tags).
type TagChoices interface {
	Lookup(ctx context.Context, userIDs []string) (map[string]Tag, error)
	MyTags(ctx context.Context, userID string) (*Tag, []TagOption, error)
	Apply(ctx context.Context, userID, serverID string) (*Tag, error)
	Clear(ctx context.Context, userID string) error
}

// TagHandler traduz HTTP para a tag de cada pessoa.
type TagHandler struct {
	tags TagChoices
}

func NewTagHandler(tags TagChoices) *TagHandler {
	return &TagHandler{tags: tags}
}

// validUserIDs tira o que não é conta (o Maestro não é UUID, por exemplo).
func validUserIDs(ids []string) []string {
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		if validID(id) {
			out = append(out, id)
		}
	}
	return out
}

// Lookup: POST /server-tags/lookup com os ids que a tela está mostrando.
func (h *TagHandler) Lookup(c *gin.Context) {
	var input struct {
		UserIDs []string `json:"user_ids"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || len(input.UserIDs) > MaxLookupUsers {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	tags, err := h.tags.Lookup(c.Request.Context(), validUserIDs(input.UserIDs))
	if err != nil {
		internalError(c, "lookup", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"tags": tags})
}

// Mine: GET /users/me/server-tag, a tag em uso e as disponíveis.
func (h *TagHandler) Mine(c *gin.Context) {
	current, options, err := h.tags.MyTags(c.Request.Context(), c.GetString("userID"))
	if err != nil {
		internalError(c, "my tags", err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"current": current, "options": options})
}

// Apply: PUT /users/me/server-tag.
func (h *TagHandler) Apply(c *gin.Context) {
	var input struct {
		ServerID string `json:"server_id"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || !validID(input.ServerID) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	tag, err := h.tags.Apply(c.Request.Context(), c.GetString("userID"), input.ServerID)
	switch {
	case errors.Is(err, ErrNotMember):
		c.JSON(http.StatusForbidden, gin.H{"error": err.Error()})
	case errors.Is(err, ErrNoTag):
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
	case err != nil:
		internalError(c, "apply", err)
	default:
		c.JSON(http.StatusOK, gin.H{"tag": tag})
	}
}

// Clear: DELETE /users/me/server-tag.
func (h *TagHandler) Clear(c *gin.Context) {
	if err := h.tags.Clear(c.Request.Context(), c.GetString("userID")); err != nil {
		internalError(c, "clear", err)
		return
	}
	c.Status(http.StatusNoContent)
}
