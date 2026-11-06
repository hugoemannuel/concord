package conversation

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// conversationRequest chama a rota com actor no contexto ("" = sem usuário).
func conversationRequest(t *testing.T, actor, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	store := newFakeStore()
	store.convs["g1"] = &Conversation{ID: "g1", Type: TypeGroup, Name: "Galera"}
	store.add("g1", "ana", "bia")
	router := gin.New()
	auth := func(c *gin.Context) {
		if actor != "" {
			c.Set("userID", actor)
		}
		c.Next()
	}
	ConversationRoutes(router.Group("/api"), &Handler{service: &Service{repository: store}}, auth)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(method, "/api"+path, strings.NewReader(body)))
	return w
}

func TestRotasDeConversaPedemUsuario(t *testing.T) {
	rotas := [][2]string{
		{http.MethodGet, "/conversations"},
		{http.MethodGet, "/conversations/with/bia"},
		{http.MethodPost, "/conversations/group"},
		{http.MethodGet, "/conversations/g1"},
		{http.MethodPut, "/conversations/g1"},
		{http.MethodDelete, "/conversations/g1/icon"},
		{http.MethodPost, "/conversations/g1/members"},
		{http.MethodDelete, "/conversations/g1/members/me"},
		{http.MethodPost, "/conversations/g1/hide"},
		{http.MethodPost, "/conversations/g1/read"},
	}
	for _, r := range rotas {
		t.Run(r[0]+" "+r[1], func(t *testing.T) {
			w := conversationRequest(t, "", r[0], r[1], `{}`)
			if w.Code != http.StatusUnauthorized || w.Body.String() != `{"error":"unauthorized"}` {
				t.Fatalf("resposta = %d %s; quer 401", w.Code, w.Body.String())
			}
		})
	}
}

func TestRotasDeConversaRecusamPedidoInvalido(t *testing.T) {
	casos := []struct {
		method, path, body string
		status             int
		resposta           string
	}{
		{http.MethodGet, "/conversations/with/ana", "", http.StatusBadRequest, `{"error":"cannot start a conversation with yourself"}`},
		{http.MethodPost, "/conversations/group", `{`, http.StatusBadRequest, `{"error":"invalid request"}`},
		{http.MethodPut, "/conversations/g1", `{`, http.StatusBadRequest, `{"error":"invalid request"}`},
		{http.MethodPost, "/conversations/g1/members", `{`, http.StatusBadRequest, `{"error":"invalid request"}`},
		{http.MethodGet, "/conversations/outra", "", http.StatusForbidden, `{"error":"you are not a participant of this conversation"}`},
	}
	for _, caso := range casos {
		t.Run(caso.method+" "+caso.path, func(t *testing.T) {
			w := conversationRequest(t, "ana", caso.method, caso.path, caso.body)
			if w.Code != caso.status || w.Body.String() != caso.resposta {
				t.Fatalf("resposta = %d %s; quer %d %s", w.Code, w.Body.String(), caso.status, caso.resposta)
			}
		})
	}
}
