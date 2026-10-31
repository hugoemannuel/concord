package event

import (
	"context"
	"errors"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// eventService é o que o handler usa do service.
type eventService interface {
	Create(ctx context.Context, serverID, actorID string, in Input) (*Event, error)
	Update(ctx context.Context, serverID, eventID, actorID string, in Input) (*Event, error)
	Cancel(ctx context.Context, serverID, eventID, actorID string) error
	List(ctx context.Context, serverID, userID string) ([]Event, error)
	SetRSVP(ctx context.Context, serverID, eventID, userID string, going bool) error
	ClearRSVP(ctx context.Context, serverID, eventID, userID string) error
	ListGoing(ctx context.Context, serverID, eventID, userID string) ([]Going, error)
	Access(ctx context.Context, serverID, userID string) (AccessView, error)
	RoleSettings(ctx context.Context, serverID, userID string) ([]RoleAccess, error)
	SetRoleActions(ctx context.Context, serverID, actorID, roleID string, actions Actions) error
}

type Handler struct {
	svc eventService
}

func NewHandler(svc eventService) *Handler {
	return &Handler{svc: svc}
}

// errorTable traduz o erro de domínio em status HTTP e `code` para o app.
var errorTable = []struct {
	err    error
	status int
	code   string
}{
	{ErrMissingPermission, http.StatusForbidden, "missing_permission"},
	{ErrNotMember, http.StatusForbidden, "not_member"},
	{ErrEventNotFound, http.StatusNotFound, "event_not_found"},
	{ErrEventEnded, http.StatusConflict, "event_ended"},
	{ErrInPast, http.StatusBadRequest, "event_in_past"},
	{ErrInvalidTitle, http.StatusBadRequest, "invalid_title"},
	{ErrInvalidDescription, http.StatusBadRequest, "invalid_description"},
	{ErrInvalidRecurrence, http.StatusBadRequest, "invalid_recurrence"},
	{ErrInvalidReminder, http.StatusBadRequest, "invalid_reminder"},
	{ErrTooManyReminders, http.StatusBadRequest, "too_many_reminders"},
	{ErrInvalidDuration, http.StatusBadRequest, "invalid_duration"},
	{ErrEventRunning, http.StatusConflict, "event_running"},
	{ErrInvalidBanner, http.StatusBadRequest, "invalid_banner"},
	{ErrInvalidGame, http.StatusBadRequest, "invalid_game"},
	{ErrRoleNotFound, http.StatusNotFound, "role_not_found"},
}

func errorResponse(err error) (status int, code string) {
	for _, row := range errorTable {
		if errors.Is(err, row.err) {
			return row.status, row.code
		}
	}
	return http.StatusInternalServerError, ""
}

// fail responde o erro; o que não é de domínio vira 500 (e vai para o log).
func fail(c *gin.Context, err error) {
	status, code := errorResponse(err)
	if status == http.StatusInternalServerError {
		log.Printf("eventos: %v", err)
		c.JSON(status, gin.H{"error": "failed to process event"})
		return
	}
	c.JSON(status, gin.H{"error": err.Error(), "code": code})
}

// actor devolve a pessoa logada; sem ela, já responde 401.
func actor(c *gin.Context) (string, bool) {
	userID := c.GetString("userID")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return "", false
	}
	return userID, true
}

// readInput lê o corpo do evento; corpo inválido já responde 400.
func readInput(c *gin.Context) (Input, bool) {
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return in, false
	}
	return in, true
}

func (h *Handler) List(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	events, err := h.svc.List(c.Request.Context(), c.Param("id"), userID)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, events)
}

func (h *Handler) Create(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	in, ok := readInput(c)
	if !ok {
		return
	}
	e, err := h.svc.Create(c.Request.Context(), c.Param("id"), userID, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusCreated, e)
}

func (h *Handler) Update(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	in, ok := readInput(c)
	if !ok {
		return
	}
	e, err := h.svc.Update(c.Request.Context(), c.Param("id"), c.Param("eventId"), userID, in)
	if err != nil {
		fail(c, err)
		return
	}
	c.JSON(http.StatusOK, e)
}

func (h *Handler) Cancel(c *gin.Context) {
	userID, ok := actor(c)
	if !ok {
		return
	}
	if err := h.svc.Cancel(c.Request.Context(), c.Param("id"), c.Param("eventId"), userID); err != nil {
		fail(c, err)
		return
	}
	c.Status(http.StatusNoContent)
}
