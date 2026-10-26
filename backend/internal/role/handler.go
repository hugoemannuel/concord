package role

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func RoleHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func respondError(c *gin.Context, err error) {
	if status, code, ok := permission.HTTPError(err); ok {
		c.JSON(status, gin.H{"error": err.Error(), "code": code})
		return
	}
	status, code := http.StatusBadRequest, "invalid"
	switch {
	case errors.Is(err, ErrRoleNotFound):
		status, code = http.StatusNotFound, "role_not_found"
	case errors.Is(err, ErrMemberNotFound):
		status, code = http.StatusNotFound, "member_not_found"
	case errors.Is(err, ErrRoleHierarchy):
		status, code = http.StatusForbidden, "role_hierarchy"
	case errors.Is(err, ErrCannotGrant):
		status, code = http.StatusForbidden, "cannot_grant"
	case errors.Is(err, ErrEveryoneRole):
		code = "everyone_role"
	case errors.Is(err, ErrBotRole):
		status, code = http.StatusForbidden, "bot_role"
	case errors.Is(err, ErrTooManyRoles):
		code = "too_many_roles"
	case errors.Is(err, ErrInvalidName), errors.Is(err, ErrInvalidColor), errors.Is(err, ErrInvalidOrder):
		code = "invalid"
	case errors.Is(err, ErrNoModeratorRole):
		status, code = http.StatusNotFound, "role_not_found"
	default:
		status, code = http.StatusInternalServerError, "internal"
	}
	msg := err.Error()
	if status == http.StatusInternalServerError {
		msg = "internal error"
	}
	c.JSON(status, gin.H{"error": msg, "code": code})
}

func currentUser(c *gin.Context) (string, bool) {
	userID, exists := c.Get("userID")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return "", false
	}
	return userID.(string), true
}

func (h *Handler) List(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	roles, err := h.service.List(c.Request.Context(), c.Param("id"), userID)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, roles)
}

func (h *Handler) Create(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	role, err := h.service.Create(c.Request.Context(), c.Param("id"), userID, in)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusCreated, role)
}

func (h *Handler) Update(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var in Input
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	role, err := h.service.Update(c.Request.Context(), c.Param("id"), userID, c.Param("roleId"), in)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, role)
}

func (h *Handler) Delete(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	if err := h.service.Delete(c.Request.Context(), c.Param("id"), userID, c.Param("roleId")); err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "role deleted"})
}

// Reorder: PUT /servers/:id/roles/order {role_ids} do mais alto para o mais baixo.
func (h *Handler) Reorder(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var in struct {
		RoleIDs []string `json:"role_ids"`
	}
	if err := c.ShouldBindJSON(&in); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}
	roles, err := h.service.Reorder(c.Request.Context(), c.Param("id"), userID, in.RoleIDs)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, roles)
}

func (h *Handler) AddMemberRole(c *gin.Context) {
	h.setMemberRole(c, true)
}

func (h *Handler) RemoveMemberRole(c *gin.Context) {
	h.setMemberRole(c, false)
}

func (h *Handler) setMemberRole(c *gin.Context, add bool) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	ids, err := h.service.SetMemberRole(c.Request.Context(), c.Param("id"), userID, c.Param("userId"), c.Param("roleId"), add)
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user_id": c.Param("userId"), "role_ids": ids})
}

// SetLegacyRole: PUT /servers/:id/members/:userId/role {role: "admin"|"member"},
// usado pelos apps de antes dos cargos.
func (h *Handler) SetLegacyRole(c *gin.Context) {
	userID, ok := currentUser(c)
	if !ok {
		return
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := c.ShouldBindJSON(&in); err != nil || (in.Role != "admin" && in.Role != "member") {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cargo inválido", "code": "invalid"})
		return
	}
	ids, err := h.service.SetModerator(c.Request.Context(), c.Param("id"), userID, c.Param("userId"), in.Role == "admin")
	if err != nil {
		respondError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"user_id": c.Param("userId"), "role": in.Role, "role_ids": ids})
}
