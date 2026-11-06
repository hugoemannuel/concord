package server

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

func TestRespondModeration(t *testing.T) {
	casos := []struct {
		err  error
		quer respostaHTTP
	}{
		{permission.ErrMissingPermission, respostaHTTP{http.StatusForbidden, `"code":"missing_permission"`}},
		{ErrCannotActOn, respostaHTTP{http.StatusForbidden, `"code":"role_hierarchy"`}},
		{ErrCannotTargetSelf, respostaHTTP{http.StatusBadRequest, `"code":"self"`}},
		{ErrOwnerCannotLeave, respostaHTTP{http.StatusBadRequest, `"code":"owner_cannot_leave"`}},
		{ErrMemberNotFound, respostaHTTP{http.StatusNotFound, `"code":"member_not_found"`}},
		{ErrBanNotFound, respostaHTTP{http.StatusNotFound, `"code":"ban_not_found"`}},
		{ErrReasonTooLong, respostaHTTP{http.StatusBadRequest, `"code":"invalid"`}},
		{ErrInvalidNickname, respostaHTTP{http.StatusBadRequest, `"code":"invalid_nickname"`}},
		{errors.New("x"), respostaHTTP{http.StatusInternalServerError, `{"code":"internal","error":"internal error"}`}},
	}
	for _, caso := range casos {
		t.Run(caso.err.Error(), func(t *testing.T) {
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			respondModeration(c, caso.err)
			if w.Code != caso.quer.status || !strings.Contains(w.Body.String(), caso.quer.body) {
				t.Fatalf("resposta = %d %s; quer %d com %s", w.Code, w.Body.String(), caso.quer.status, caso.quer.body)
			}
		})
	}
}

func TestBanHandler(t *testing.T) {
	casos := map[string]struct {
		actor, body string
		quer        respostaHTTP
	}{
		"bane":          {"chefe", `{"user_id":"ana","reason":"spam"}`, respostaHTTP{http.StatusCreated, `{"message":"user banned"}`}},
		"json inválido": {"chefe", `{`, respostaHTTP{http.StatusBadRequest, `{"error":"user_id is required"}`}},
		"sem alvo":      {"chefe", `{}`, respostaHTTP{http.StatusBadRequest, `{"error":"user_id is required"}`}},
		"sem usuário":   {"", `{"user_id":"ana"}`, respostaHTTP{http.StatusUnauthorized, `{"error":"unauthorized"}`}},
		"sem permissão": {"mod", `{"user_id":"ana"}`, respostaHTTP{http.StatusForbidden, `"code":"missing_permission"`}},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			m, _, _, _ := setupModeration()
			confere(t, &Handler{moderation: m}, caso.actor, http.MethodPost, "/servers/s1/bans", caso.body, caso.quer)
		})
	}
}
