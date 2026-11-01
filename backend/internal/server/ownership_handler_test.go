package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakeTransfer struct {
	err   error
	actor string
	to    string
}

func (f *fakeTransfer) Transfer(_ context.Context, _, actorID, toID string) (*Server, error) {
	f.actor, f.to = actorID, toID
	if f.err != nil {
		return nil, f.err
	}
	return &Server{ID: "s", OwnerID: toID}, nil
}

func TestOwnershipHandlerTransfer(t *testing.T) {
	gin.SetMode(gin.TestMode)
	for _, tc := range []struct {
		name   string
		body   string
		err    error
		status int
	}{
		{"sem novo dono", `{}`, nil, http.StatusBadRequest},
		{"transfere", `{"user_id":"ana"}`, nil, http.StatusOK},
		{"servidor não existe", `{"user_id":"ana"}`, ErrServerNotFound, http.StatusNotFound},
		{"não é o dono", `{"user_id":"ana"}`, ErrNotServerOwner, http.StatusForbidden},
		{"novo dono inválido", `{"user_id":"ana"}`, ErrInvalidNewOwner, http.StatusBadRequest},
		{"falha do banco", `{"user_id":"ana"}`, errors.New("caiu"), http.StatusInternalServerError},
	} {
		t.Run(tc.name, func(t *testing.T) {
			svc := &fakeTransfer{err: tc.err}
			r := gin.New()
			r.Use(func(c *gin.Context) { c.Set("userID", "dono") })
			OwnershipRoutes(r.Group("/api"), NewOwnershipHandler(svc), func(c *gin.Context) { c.Next() })
			w := httptest.NewRecorder()
			r.ServeHTTP(w, httptest.NewRequest(http.MethodPut, "/api/servers/s/owner", strings.NewReader(tc.body)))

			if w.Code != tc.status {
				t.Fatalf("status = %d, quer %d (%s)", w.Code, tc.status, w.Body)
			}
			if tc.status == http.StatusOK && (svc.actor != "dono" || svc.to != "ana") {
				t.Errorf("Transfer(%q → %q)", svc.actor, svc.to)
			}
		})
	}
}
