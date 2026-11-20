package role

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
)

type fakeMyRoles struct {
	byUser map[string]map[string][]string
	err    error
}

func (f fakeMyRoles) RoleIDsByServer(_ context.Context, userID string) (map[string][]string, error) {
	return f.byUser[userID], f.err
}

func myRolesRequest(userID string, store myRolesStore) *httptest.ResponseRecorder {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	auth := func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
		c.Next()
	}
	MyRolesRoutes(router.Group("/api"), NewMyRolesHandler(store), auth)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/users/me/server-roles", nil))
	return w
}

func TestMyRolesListsOnlyTheCallersRoles(t *testing.T) {
	store := fakeMyRoles{byUser: map[string]map[string][]string{
		"ana": {"s1": {"vip", "suporte"}, "s2": {"mod"}},
		"bia": {"s1": {"admin"}},
	}}
	w := myRolesRequest("ana", store)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	var got map[string][]string
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	want := map[string][]string{"s1": {"vip", "suporte"}, "s2": {"mod"}}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestMyRolesWithoutRolesIsAnEmptyObject(t *testing.T) {
	w := myRolesRequest("semcargo", fakeMyRoles{})
	if w.Code != http.StatusOK || w.Body.String() != "{}" {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
}

func TestMyRolesNeedsLoginAndReportsFailure(t *testing.T) {
	if w := myRolesRequest("", fakeMyRoles{}); w.Code != http.StatusUnauthorized {
		t.Fatalf("sem login: status = %d", w.Code)
	}
	if w := myRolesRequest("ana", fakeMyRoles{err: errors.New("db fora")}); w.Code != http.StatusInternalServerError {
		t.Fatalf("falha do banco: status = %d", w.Code)
	}
}
