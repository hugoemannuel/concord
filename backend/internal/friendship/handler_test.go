package friendship

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSendRequestHandler(t *testing.T) {
	casos := map[string]struct {
		actor, body string
		status      int
		resposta    string
	}{
		"pedido enviado": {"b", `{"username":"ana"}`, http.StatusCreated, `{"message":"friend request sent","result":"sent"}`},
		"json inválido":  {"b", `{`, http.StatusBadRequest, `{"error":"invalid request"}`},
		"sem usuário":    {"", `{"username":"ana"}`, http.StatusUnauthorized, `{"error":"unauthorized"}`},
		"usuário sumido": {"b", `{"username":"ninguem"}`, http.StatusNotFound, `"code":"user_not_found"`},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			s, _, _, _ := setup()
			gin.SetMode(gin.TestMode)
			router := gin.New()
			auth := func(c *gin.Context) {
				if caso.actor != "" {
					c.Set("userID", caso.actor)
				}
				c.Next()
			}
			FriendRoutes(router.Group("/api"), FriendshipHandler(s), auth)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/friends/request", strings.NewReader(caso.body)))
			if w.Code != caso.status || !strings.Contains(w.Body.String(), caso.resposta) {
				t.Fatalf("resposta = %d %s; quer %d com %s", w.Code, w.Body.String(), caso.status, caso.resposta)
			}
		})
	}
}
