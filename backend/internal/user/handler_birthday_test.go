package user

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

func TestSetBirthdayHandler(t *testing.T) {
	casos := map[string]struct {
		actor, body string
		err         error
		status      int
		resposta    string
	}{
		"grava":         {meID, `{"day":3,"month":4}`, nil, http.StatusOK, `"day":3`},
		"sem usuário":   {"", `{}`, nil, http.StatusUnauthorized, `{"error":"unauthorized"}`},
		"json inválido": {meID, `{`, nil, http.StatusBadRequest, `{"error":"invalid request"}`},
		"data inválida": {meID, `{"day":31,"month":2}`, ErrInvalidBirthday, http.StatusBadRequest, `{"error":"` + ErrInvalidBirthday.Error() + `"}`},
		"falha":         {meID, `{}`, errors.New("banco"), http.StatusInternalServerError, `{"error":"banco"}`},
	}
	for nome, caso := range casos {
		t.Run(nome, func(t *testing.T) {
			gin.SetMode(gin.TestMode)
			h := &Handler{service: &fakeUserStore{birthdayErr: caso.err}}
			router := gin.New()
			router.PUT("/users/me/birthday", func(c *gin.Context) {
				if caso.actor != "" {
					c.Set("userID", caso.actor)
				}
			}, h.SetBirthday)
			w := httptest.NewRecorder()
			router.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/users/me/birthday", strings.NewReader(caso.body)))
			if w.Code != caso.status || !strings.Contains(w.Body.String(), caso.resposta) {
				t.Fatalf("resposta = %d %s; quer %d com %s", w.Code, w.Body.String(), caso.status, caso.resposta)
			}
		})
	}
}
