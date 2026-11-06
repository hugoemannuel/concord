package role

import (
	"errors"
	"net/http"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	service *Service
}

func RoleHandler(service *Service) *Handler {
	return &Handler{service: service}
}

// errorCodes: status e código de cada erro do domínio, na ordem em que são
// conferidos (errors.Is).
var errorCodes = []struct {
	err    error
	status int
	code   string
}{
	{ErrRoleNotFound, http.StatusNotFound, "role_not_found"},
	{ErrMemberNotFound, http.StatusNotFound, "member_not_found"},
	{ErrRoleHierarchy, http.StatusForbidden, "role_hierarchy"},
	{ErrOwnerRoles, http.StatusForbidden, "owner_roles"},
	{ErrCannotGrant, http.StatusForbidden, "cannot_grant"},
	{ErrEveryoneRole, http.StatusBadRequest, "everyone_role"},
	{ErrBotRole, http.StatusForbidden, "bot_role"},
	{ErrTooManyRoles, http.StatusBadRequest, "too_many_roles"},
	{ErrInvalidName, http.StatusBadRequest, "invalid"},
	{ErrInvalidColor, http.StatusBadRequest, "invalid"},
	{ErrInvalidOrder, http.StatusBadRequest, "invalid"},
}

// errorStatus: status e código HTTP de um erro do domínio (500 se não é um deles).
func errorStatus(err error) (int, string) {
	for _, e := range errorCodes {
		if errors.Is(err, e.err) {
			return e.status, e.code
		}
	}
	return http.StatusInternalServerError, "internal"
}

func respondError(c *gin.Context, err error) {
	if status, code, ok := permission.HTTPError(err); ok {
		c.JSON(status, gin.H{"error": err.Error(), "code": code})
		return
	}
	status, code := errorStatus(err)
	msg := err.Error()
	if status == http.StatusInternalServerError {
		msg = "internal error"
	}
	c.JSON(status, gin.H{"error": msg, "code": code})
}

func (h *Handler) List(c *gin.Context) {
	userID, ok := authctx.UserID(c)
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
	userID, ok := authctx.UserID(c)
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
	userID, ok := authctx.UserID(c)
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
	userID, ok := authctx.UserID(c)
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
	userID, ok := authctx.UserID(c)
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
	userID, ok := authctx.UserID(c)
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
