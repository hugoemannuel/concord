package message

import (
	"net/http"
	"testing"

	"github.com/gin-gonic/gin"
)

// O POST de mensagem na DM: as recusas antes de chegar no banco. DM não tem
// modo lento.
func TestCreateConversationMessageRecusas(t *testing.T) {
	cases := []struct {
		name   string
		access fakeAccess
		user   bool
		raw    string
		status int
	}{
		{"JSON inválido", fakeAccess{}, true, `{`, http.StatusBadRequest},
		{"sem usuário", fakeAccess{}, false, `{"content":"oi"}`, http.StatusUnauthorized},
		{"bloqueado", fakeAccess{writeErr: ErrBlocked}, true, `{"content":"oi"}`, http.StatusForbidden},
		{"sem texto nem mídia", fakeAccess{}, true, `{"content":"  "}`, http.StatusBadRequest},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			r := gin.New()
			auth := func(ctx *gin.Context) {
				if c.user {
					ctx.Set("userID", "ana")
				}
				ctx.Next()
			}
			MessageRoutes(r.Group("/api"), &Handler{service: &Service{}, access: c.access}, auth)
			if rec := postRaw(r, "/api/conversations/dm1/messages", c.raw); rec.Code != c.status {
				t.Fatalf("status %d body %s; quero %d", rec.Code, rec.Body, c.status)
			}
		})
	}
}
