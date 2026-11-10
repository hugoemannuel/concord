package castigo

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// httpWorld: as rotas com um auth fake (o cabeçalho X-User é o login).
func httpWorld(t *testing.T) (*world, *gin.Engine) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := newWorld(t)
	router := gin.New()
	auth := func(c *gin.Context) {
		id := c.GetHeader("X-User")
		if id == "" {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		c.Set("userID", id)
	}
	Routes(router.Group("/api"), NewHandler(w.svc), auth)
	return w, router
}

func do(router *gin.Engine, method, path, user, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if user != "" {
		req.Header.Set("X-User", user)
	}
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func code(t *testing.T, rec *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return body.Code
}

func TestHTTPCastigoDireto(t *testing.T) {
	_, router := httpWorld(t)
	speak := `{"user_id":"ana","effects":{"speak":true},"duration":300}`

	if rec := do(router, "POST", "/api/servers/srv-1/castigos", "", speak); rec.Code != http.StatusUnauthorized {
		t.Fatalf("sem login: %d", rec.Code)
	}
	if rec := do(router, "POST", "/api/servers/srv-1/castigos", "bia", speak); rec.Code != http.StatusForbidden || code(t, rec) != "missing_permission" {
		t.Errorf("comum: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(router, "POST", "/api/servers/srv-1/castigos", "mod", `{"user_id":"ana"`); rec.Code != http.StatusBadRequest {
		t.Errorf("JSON quebrado: %d", rec.Code)
	}
	if rec := do(router, "POST", "/api/servers/srv-1/castigos", "mod", speak); rec.Code != http.StatusOK {
		t.Fatalf("mod: %d %s", rec.Code, rec.Body.String())
	}
	rec := do(router, "GET", "/api/servers/srv-1/castigos", "bia", "")
	var list []Castigo
	if err := json.Unmarshal(rec.Body.Bytes(), &list); err != nil || len(list) != 1 {
		t.Fatalf("lista: %s", rec.Body.String())
	}
	if rec := do(router, "DELETE", "/api/servers/srv-1/castigos/ana", "mod", ""); rec.Code != http.StatusOK {
		t.Errorf("tirar: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(router, "DELETE", "/api/servers/srv-1/castigos/ana", "mod", ""); rec.Code != http.StatusNotFound {
		t.Errorf("tirar de novo: %d", rec.Code)
	}
}

func TestHTTPVotacao(t *testing.T) {
	w, router := httpWorld(t)
	w.inCall("ana", "bia", "caio")

	rec := do(router, "POST", "/api/calls/c1/castigo-votes", "ana", `{"user_id":"caio","effects":{"listen":true},"duration":60}`)
	if rec.Code != http.StatusCreated {
		t.Fatalf("abrir: %d %s", rec.Code, rec.Body.String())
	}
	var v Vote
	_ = json.Unmarshal(rec.Body.Bytes(), &v)
	if rec := do(router, "POST", "/api/calls/c1/castigo-votes", "bia", `{"user_id":"caio","effects":{"listen":true},"duration":60}`); rec.Code != http.StatusConflict || code(t, rec) != "vote_open" {
		t.Errorf("segunda votação: %d %s", rec.Code, rec.Body.String())
	}
	if rec := do(router, "GET", "/api/calls/c1/castigo-votes/current", "bia", ""); rec.Code != http.StatusOK {
		t.Errorf("votação aberta: %d", rec.Code)
	}
	if rec := do(router, "POST", "/api/calls/c1/castigo-votes/"+v.ID+"/ballots", "bia", `{}`); rec.Code != http.StatusBadRequest {
		t.Errorf("voto sem sim/não: %d", rec.Code)
	}
	if rec := do(router, "POST", "/api/calls/c1/castigo-votes/"+v.ID+"/ballots", "bia", `{"yes":true}`); rec.Code != http.StatusOK {
		t.Fatalf("votar: %d %s", rec.Code, rec.Body.String())
	}
	if !w.svc.Restriction("srv-1", "caio").NoListen {
		t.Error("castigo aprovado vale")
	}
	if rec := do(router, "GET", "/api/calls/c1/castigo-votes/current", "bia", ""); rec.Code != http.StatusNoContent {
		t.Errorf("sem votação aberta: %d", rec.Code)
	}
}
