package message

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

const (
	favMsgID   = "11111111-1111-4111-8111-111111111111"
	favOtherID = "22222222-2222-4222-8222-222222222222"
)

func favoriteRouter(store *fakeFavoriteStore, access RoomAccess) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	auth := func(c *gin.Context) {
		if id := c.GetHeader("X-User"); id != "" {
			c.Set("userID", id)
		}
		c.Next()
	}
	FavoriteRoutes(r.Group("/api"), NewFavoriteHandler(NewFavoriteService(store, access)), auth)
	return r
}

func favRequest(r *gin.Engine, method, path, user string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, nil)
	if user != "" {
		req.Header.Set("X-User", user)
	}
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

func TestRotasDeFavoritas(t *testing.T) {
	store := newFakeFavoriteStore(favChannelMsg(favMsgID, "c1"), favChannelMsg(favOtherID, "c2"))
	access := &readRooms{allowed: map[Room][]string{{ChannelID: "c1"}: {"ana"}}}
	r := favoriteRouter(store, access)
	base := "/api/users/me/message-favorites"

	cases := []struct {
		name, method, path, user string
		status                   int
	}{
		{"sem login", http.MethodGet, base, "", http.StatusUnauthorized},
		{"favorita", http.MethodPut, base + "/" + favMsgID, "ana", http.StatusOK},
		{"sala que não lê", http.MethodPut, base + "/" + favOtherID, "ana", http.StatusNotFound},
		{"id inválido", http.MethodPut, base + "/nao-e-uuid", "ana", http.StatusNotFound},
		{"lista", http.MethodGet, base, "ana", http.StatusOK},
		{"ids", http.MethodGet, base + "/ids", "ana", http.StatusOK},
		{"tira", http.MethodDelete, base + "/" + favMsgID, "ana", http.StatusNoContent},
		{"tira id inválido", http.MethodDelete, base + "/x", "ana", http.StatusNotFound},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if w := favRequest(r, tc.method, tc.path, tc.user); w.Code != tc.status {
				t.Errorf("status = %d, quer %d (%s)", w.Code, tc.status, w.Body.String())
			}
		})
	}
}

func TestRotaFavoritaRespondeItemEListaDepois(t *testing.T) {
	store := newFakeFavoriteStore(favChannelMsg(favMsgID, "c1"))
	access := &readRooms{allowed: map[Room][]string{{ChannelID: "c1"}: {"ana"}}}
	r := favoriteRouter(store, access)
	base := "/api/users/me/message-favorites"

	w := favRequest(r, http.MethodPut, base+"/"+favMsgID, "ana")
	var fav Favorite
	if err := json.Unmarshal(w.Body.Bytes(), &fav); err != nil || fav.MessageID != favMsgID || fav.Message == nil {
		t.Fatalf("PUT = %s, quer o item com a mensagem", w.Body.String())
	}

	w = favRequest(r, http.MethodGet, base+"/ids", "ana")
	var ids []string
	if err := json.Unmarshal(w.Body.Bytes(), &ids); err != nil || len(ids) != 1 || ids[0] != favMsgID {
		t.Fatalf("ids = %s, quer [%s]", w.Body.String(), favMsgID)
	}
}

func TestRotaFavoritaCheiaDa409(t *testing.T) {
	store := newFakeFavoriteStore(favChannelMsg(favMsgID, "c1"))
	store.full = true
	access := &readRooms{allowed: map[Room][]string{{ChannelID: "c1"}: {"ana"}}}

	w := favRequest(favoriteRouter(store, access), http.MethodPut, "/api/users/me/message-favorites/"+favMsgID, "ana")
	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, quer 409", w.Code)
	}
}
