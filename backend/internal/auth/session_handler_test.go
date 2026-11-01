package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

func sessionRouter(s *Service, userID string) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := &Handler{service: s}
	r := gin.New()
	asUser := func(c *gin.Context) { c.Set("userID", userID) }
	r.POST("/auth/refresh", h.Refresh)
	r.POST("/auth/logout", asUser, h.Logout)
	r.POST("/auth/logout-all", asUser, h.LogoutAll)
	return r
}

func post(r *gin.Engine, path, body string) int {
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodPost, path, strings.NewReader(body)))
	return w.Code
}

func TestRefreshRecusaPedidoInvalido(t *testing.T) {
	r := sessionRouter(NewService(nil, []byte("segredo-de-teste")), "")
	if code := post(r, "/auth/refresh", `{`); code != http.StatusBadRequest {
		t.Errorf("JSON quebrado: %d", code)
	}
	if code := post(r, "/auth/refresh", `{"refresh_token":"lixo"}`); code != http.StatusUnauthorized {
		t.Errorf("token inválido: %d", code)
	}
}

func TestDBSairDeTodosOsDispositivosPelaRota(t *testing.T) {
	db, repo := emailTokensDB(t)
	userID := insertTokenOwner(t, db)
	s := NewService(repo, []byte("segredo-de-teste-com-32-bytes-ok"))
	s.SetSessionVersions(NewVersionCache(repo, time.Minute))
	ctx := context.Background()
	here, _ := s.GenerateRefreshToken(ctx, userID)
	other, _ := s.GenerateRefreshToken(ctx, userID)
	r := sessionRouter(s, userID)

	if code := post(r, "/auth/refresh", `{"refresh_token":"`+other+`"}`); code != http.StatusOK {
		t.Fatalf("renovar: %d", code)
	}
	if code := post(r, "/auth/logout", `{"refresh_token":"`+here+`"}`); code != http.StatusOK {
		t.Fatalf("sair deste dispositivo: %d", code)
	}
	if code := post(r, "/auth/refresh", `{"refresh_token":"`+here+`"}`); code != http.StatusUnauthorized {
		t.Fatalf("refresh de quem saiu: %d, quer 401", code)
	}
	if code := post(r, "/auth/logout-all", ``); code != http.StatusNoContent {
		t.Fatalf("sair de todos: %d", code)
	}
	var left int
	db.QueryRow(ctx, `SELECT count(*) FROM refresh_tokens WHERE user_id = $1`, userID).Scan(&left)
	if left != 0 {
		t.Errorf("sobraram %d refresh tokens depois de sair de todos", left)
	}
	if code := post(r, "/auth/logout", ``); code != http.StatusOK {
		t.Errorf("sair sem corpo (app antigo): %d", code)
	}
}
