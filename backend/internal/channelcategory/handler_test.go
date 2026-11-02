package channelcategory

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"
	"github.com/gin-gonic/gin"
)

type fakePermissions struct{ snap *permission.Snapshot }

func (p fakePermissions) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	return p.snap, nil
}

type fakeStore struct{ creates int }

func (s *fakeStore) List(context.Context, string) (Layout, error) {
	return Layout{Categories: []Category{}, Channels: []Placement{{ChannelID: "publico"}, {ChannelID: "privado"}}}, nil
}
func (s *fakeStore) Create(context.Context, string, string) error                        { s.creates++; return nil }
func (s *fakeStore) Rename(context.Context, string, string, string) error                { return nil }
func (s *fakeStore) Delete(context.Context, string, string) error                        { return nil }
func (s *fakeStore) MoveCategory(context.Context, string, string, string) error          { return nil }
func (s *fakeStore) MoveChannel(context.Context, string, string, *string, *string) error { return nil }

func TestCategoryRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	snap := permission.NewSnapshot("s1", "dono", permission.DefaultEveryone).WithMember("dono").WithMember("ana").WithChannel("publico", "text").WithChannel("privado", "text", permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel})
	store := &fakeStore{}
	router := gin.New()
	user := "ana"
	Routes(router.Group("/api"), NewHandler(store, fakePermissions{snap}, nil), func(c *gin.Context) { c.Set("userID", user); c.Next() })
	request := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, "/api/servers/s1/categories"+path, strings.NewReader(body))
		r.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		router.ServeHTTP(w, r)
		return w
	}
	t.Run("filtra canais privados", func(t *testing.T) {
		w := request(http.MethodGet, "", "")
		if w.Code != 200 || strings.Contains(w.Body.String(), "privado") || !strings.Contains(w.Body.String(), "publico") {
			t.Fatalf("resposta: %d %s", w.Code, w.Body.String())
		}
	})
	t.Run("exige permissão para criar", func(t *testing.T) {
		w := request(http.MethodPost, "", `{"name":"Jogos"}`)
		if w.Code != 403 || store.creates != 0 {
			t.Fatalf("status %d, criações %d", w.Code, store.creates)
		}
	})
	t.Run("valida nome", func(t *testing.T) {
		user = "dono"
		w := request(http.MethodPost, "", `{"name":"   "}`)
		if w.Code != 400 || store.creates != 0 {
			t.Fatalf("status %d, criações %d", w.Code, store.creates)
		}
	})
	t.Run("permite ao dono criar", func(t *testing.T) {
		w := request(http.MethodPost, "", `{"name":"Jogos"}`)
		if w.Code != 204 || store.creates != 1 {
			t.Fatalf("status %d, criações %d", w.Code, store.creates)
		}
	})
	t.Run("valida movimentação", func(t *testing.T) {
		for _, tc := range []struct {
			path, body string
			status     int
		}{
			{"/categoria/order", `{"direction":"up"}`, 204},
			{"/categoria/order", `{"direction":"down"}`, 204},
			{"/categoria/order", `{"direction":"lado"}`, 400},
			{"/channels/publico", `{"category_id":null}`, 204},
			{"/channels/inexistente", `{"category_id":null}`, 404},
			{"/channels/publico", `{"before_id":"inexistente"}`, 404},
			{"/channels/publico", `{`, 400},
		} {
			w := request(http.MethodPut, tc.path, tc.body)
			if w.Code != tc.status {
				t.Errorf("%s %s: status %d, esperado %d", tc.path, tc.body, w.Code, tc.status)
			}
		}
	})
}
