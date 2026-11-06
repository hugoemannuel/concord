package call

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// callRequest faz a requisição na rota de chamadas com o userID dado ("" =
// rota sem usuário no contexto).
func callRequest(t *testing.T, service *Service, userID, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	fakeAuth := func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
		c.Next()
	}
	CallRoutes(router.Group("/api"), CallHandler(service, nil), fakeAuth, fakeAuth)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(rec, req)
	return rec
}

func assertResponse(t *testing.T, rec *httptest.ResponseRecorder, status int, body string) {
	t.Helper()
	if rec.Code != status || strings.TrimSpace(rec.Body.String()) != body {
		t.Fatalf("resposta = %d %s; quer %d %s", rec.Code, rec.Body.String(), status, body)
	}
}

func TestCreateRecusaPedidoIncompleto(t *testing.T) {
	casos := map[string]struct {
		user, body string
		status     int
		resposta   string
	}{
		"json inválido":     {"u1", `{`, http.StatusBadRequest, `{"error":"invalid request"}`},
		"sem usuário":       {"", `{"type":"dm"}`, http.StatusUnauthorized, `{"error":"unauthorized"}`},
		"dm sem conversa":   {"u1", `{"type":"dm"}`, http.StatusBadRequest, `{"error":"conversation_id is required"}`},
		"canal sem canal":   {"u1", `{"type":"channel"}`, http.StatusBadRequest, `{"error":"channel_id is required"}`},
		"tipo desconhecido": {"u1", `{"type":"x"}`, http.StatusBadRequest, `{"error":"` + ErrInvalidType.Error() + `"}`},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			rec := callRequest(t, serviceWithCall("c1"), caso.user, http.MethodPost, "/api/calls", caso.body)
			assertResponse(t, rec, caso.status, caso.resposta)
		})
	}
}

func TestRespondStart(t *testing.T) {
	casos := map[string]struct {
		call     *Call
		err      error
		status   int
		resposta string
	}{
		"criada":               {&Call{ID: "c1"}, nil, http.StatusCreated, `"id":"c1"`},
		"trancada com chamada": {&Call{ID: "c1"}, ErrLocked, http.StatusLocked, `{"call_id":"c1","error":"` + ErrLocked.Error() + `"}`},
		"trancada sem chamada": {nil, ErrLocked, http.StatusLocked, `{"error":"` + ErrLocked.Error() + `"}`},
		"ocupado":              {nil, ErrBusy, http.StatusBadRequest, `{"error":"` + ErrBusy.Error() + `"}`},
		"falha nossa":          {nil, errors.New("boom"), http.StatusInternalServerError, `{"error":"boom"}`},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			rec := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(rec)
			respondStart(c, caso.call, caso.err)
			if rec.Code != caso.status || !strings.Contains(rec.Body.String(), caso.resposta) {
				t.Fatalf("resposta = %d %s; quer %d com %s", rec.Code, rec.Body.String(), caso.status, caso.resposta)
			}
		})
	}
}

func TestActiveRecusaConsultaInvalida(t *testing.T) {
	casos := map[string]struct {
		user, query string
		status      int
		resposta    string
	}{
		"escopo inválido": {"u1", "scope=x&id=1", http.StatusBadRequest, `{"error":"scope must be dm, channel or server"}`},
		"sem escopo":      {"u1", "id=1", http.StatusBadRequest, `{"error":"scope must be dm, channel or server"}`},
		"sem id":          {"u1", "scope=dm", http.StatusBadRequest, `{"error":"id query is required"}`},
		"sem usuário":     {"", "scope=server&id=1", http.StatusUnauthorized, `{"error":"unauthorized"}`},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			rec := callRequest(t, serviceWithCall("c1"), caso.user, http.MethodGet, "/api/calls/active?"+caso.query, "")
			assertResponse(t, rec, caso.status, caso.resposta)
		})
	}
}

func TestDeleteEncerraSoParaParticipante(t *testing.T) {
	casos := map[string]struct {
		user, path string
		status     int
		resposta   string
	}{
		"sem usuário":         {"", "/api/calls/c1", http.StatusUnauthorized, `{"error":"unauthorized"}`},
		"chamada inexistente": {"u1", "/api/calls/outra", http.StatusNotFound, `{"error":"` + ErrNotFound.Error() + `"}`},
		"fora da chamada":     {"intruso", "/api/calls/c1", http.StatusForbidden, `{"error":"` + ErrNotAllowed.Error() + `"}`},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			rec := callRequest(t, serviceWithCall("c1", "u1"), caso.user, http.MethodDelete, caso.path, "")
			assertResponse(t, rec, caso.status, caso.resposta)
		})
	}
}

func TestEndStatus(t *testing.T) {
	casos := map[error]int{
		ErrNotFound:         http.StatusNotFound,
		ErrNotAllowed:       http.StatusForbidden,
		errors.New("banco"): http.StatusInternalServerError,
	}
	for err, quer := range casos {
		if got := endStatus(err); got != quer {
			t.Fatalf("endStatus(%v) = %d; quer %d", err, got, quer)
		}
	}
}
