package castigo

import (
	"context"
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

// Castigos é o que o Handler usa do Service.
type Castigos interface {
	List(ctx context.Context, serverID, viewerID string) ([]Castigo, error)
	Apply(ctx context.Context, serverID, actorID string, req Request) (Castigo, error)
	Lift(ctx context.Context, serverID, actorID, targetID string) error
	StartVote(ctx context.Context, callID, initiatorID string, req Request) (Vote, error)
	CastVote(ctx context.Context, callID, voteID, voterID string, yes bool) (Vote, error)
	CurrentVote(callID, userID string) (Vote, bool)
}

type Handler struct {
	service Castigos
}

func NewHandler(s Castigos) *Handler { return &Handler{service: s} }

// httpErrors: status e code de cada erro do domínio (o app traduz pelo code).
var httpErrors = []struct {
	err    error
	status int
	code   string
}{
	{ErrInvalid, http.StatusBadRequest, "invalid"},
	{ErrSelf, http.StatusBadRequest, "self"},
	{ErrNotInCall, http.StatusBadRequest, "not_in_call"},
	{ErrFewVoters, http.StatusBadRequest, "few_voters"},
	{ErrNotMember, http.StatusForbidden, "not_member"},
	{ErrMissingPerm, http.StatusForbidden, "missing_permission"},
	{ErrCannotActOn, http.StatusForbidden, "role_hierarchy"},
	{ErrOwner, http.StatusForbidden, "owner"},
	{ErrNotVoter, http.StatusForbidden, "not_voter"},
	{ErrNotFound, http.StatusNotFound, "not_found"},
	{ErrVoteNotFound, http.StatusNotFound, "vote_not_found"},
	{ErrVoteOpen, http.StatusConflict, "vote_open"},
	{ErrAlreadyVoted, http.StatusConflict, "already_voted"},
	{ErrVoteCooldown, http.StatusTooManyRequests, "cooldown"},
}

func respondError(c *gin.Context, err error) {
	for _, e := range httpErrors {
		if errors.Is(err, e.err) {
			c.JSON(e.status, gin.H{"error": err.Error(), "code": e.code})
			return
		}
	}
	c.JSON(http.StatusInternalServerError, gin.H{"error": "internal error", "code": "internal"})
}

// bindRequest lê o pedido de castigo (direto ou da votação).
func bindRequest(c *gin.Context) (Request, bool) {
	var req Request
	if err := c.ShouldBindJSON(&req); err != nil {
		respondError(c, ErrInvalid)
		return Request{}, false
	}
	return req, true
}

// List: GET /servers/:id/castigos.
func (h *Handler) List(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	list, err := h.service.List(c.Request.Context(), c.Param("id"), userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, list)
}

// Apply: POST /servers/:id/castigos {user_id, effects, duration}.
func (h *Handler) Apply(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	req, ok := bindRequest(c)
	if !ok {
		return
	}
	castigo, err := h.service.Apply(c.Request.Context(), c.Param("id"), userID, req)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, castigo)
}

// Lift: DELETE /servers/:id/castigos/:userId.
func (h *Handler) Lift(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	if err := h.service.Lift(c.Request.Context(), c.Param("id"), userID, c.Param("userId")); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// StartVote: POST /calls/:id/castigo-votes {user_id, effects, duration}.
func (h *Handler) StartVote(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	req, ok := bindRequest(c)
	if !ok {
		return
	}
	vote, err := h.service.StartVote(c.Request.Context(), c.Param("id"), userID, req)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, vote)
}

// CastVote: POST /calls/:id/castigo-votes/:voteId/ballots {yes}.
func (h *Handler) CastVote(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	var input struct {
		Yes *bool `json:"yes"`
	}
	if err := c.ShouldBindJSON(&input); err != nil || input.Yes == nil {
		respondError(c, ErrInvalid)
		return
	}
	vote, err := h.service.CastVote(c.Request.Context(), c.Param("id"), c.Param("voteId"), userID, *input.Yes)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, vote)
}

// CurrentVote: GET /calls/:id/castigo-votes/current (204 sem votação aberta).
func (h *Handler) CurrentVote(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	vote, open := h.service.CurrentVote(c.Param("id"), userID)
	if !open {
		c.Status(http.StatusNoContent)
		return
	}
	c.JSON(http.StatusOK, vote)
}
