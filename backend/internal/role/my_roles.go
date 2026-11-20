package role

import (
	"context"
	"net/http"

	"gin-quickstart/backend/internal/platform/authctx"

	"github.com/gin-gonic/gin"
	"github.com/jackc/pgx/v5"
)

// Os cargos da própria pessoa em cada servidor. O app usa para saber se uma
// menção de cargo é para ela mesmo fora do servidor aberto (ADR 0065).

type myRolesStore interface {
	RoleIDsByServer(ctx context.Context, userID string) (map[string][]string, error)
}

type MyRolesHandler struct {
	store myRolesStore
}

func NewMyRolesHandler(store myRolesStore) *MyRolesHandler {
	return &MyRolesHandler{store: store}
}

func MyRolesRoutes(router *gin.RouterGroup, handler *MyRolesHandler, authMiddleware gin.HandlerFunc) {
	router.GET("/users/me/server-roles", authMiddleware, handler.List)
}

// List responde {id do servidor: [ids dos cargos]}. Servidor em que a pessoa
// não tem cargo (só o @everyone) não aparece.
func (h *MyRolesHandler) List(c *gin.Context) {
	userID, ok := authctx.UserID(c)
	if !ok {
		return
	}
	roles, err := h.store.RoleIDsByServer(c.Request.Context(), userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to load roles"})
		return
	}
	if roles == nil {
		roles = map[string][]string{}
	}
	c.JSON(http.StatusOK, roles)
}

// RoleIDsByServer: os cargos da pessoa em todos os servidores de que é membro.
func (r *Repository) RoleIDsByServer(ctx context.Context, userID string) (map[string][]string, error) {
	rows, err := r.db.Query(ctx, `SELECT server_id::text, role_id::text FROM member_roles WHERE user_id = $1`, userID)
	if err != nil {
		return nil, err
	}
	out := map[string][]string{}
	var serverID, roleID string
	_, err = pgx.ForEachRow(rows, []any{&serverID, &roleID}, func() error {
		out[serverID] = append(out[serverID], roleID)
		return nil
	})
	return out, err
}
