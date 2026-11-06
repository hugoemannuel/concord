package user

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// assertNoEmail falha se o JSON tiver o e-mail ou a chave "email".
func assertNoEmail(t *testing.T, what string, body []byte, email string) {
	t.Helper()
	if strings.Contains(string(body), email) || strings.Contains(string(body), `"email"`) {
		t.Errorf("%s expõe e-mail: %s", what, body)
	}
}

func TestUserJSONNeverHasEmail(t *testing.T) {
	u := User{ID: "u1", Username: "baal", DisplayName: "Baal", Email: "b@x.com"}
	raw, err := json.Marshal(u)
	if err != nil {
		t.Fatal(err)
	}
	assertNoEmail(t, "User", raw, "b@x.com")

	raw, _ = json.Marshal([]User{u})
	assertNoEmail(t, "[]User", raw, "b@x.com")
}

func TestSelfKeepsOwnEmail(t *testing.T) {
	u := &User{ID: "u1", Username: "mugis", DisplayName: "Mugis", Email: "m@x.com", Links: []ProfileLink{}}
	raw, err := json.Marshal(u.Self())
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	if got["email"] != "m@x.com" || got["username"] != "mugis" || got["id"] != "u1" {
		t.Errorf("Self() = %s, want id, username e o próprio e-mail", raw)
	}
	if _, ok := got["password_hash"]; ok {
		t.Error("Self() não pode ter o hash da senha")
	}
}

type fakeUserStore struct {
	users       []User
	gotQuery    string
	gotExcluded string
	birthdayErr error
}

func (f *fakeUserStore) FindByID(_ context.Context, id string) (*User, error) {
	for i := range f.users {
		if f.users[i].ID == id {
			u := f.users[i]
			return &u, nil
		}
	}
	return nil, context.Canceled
}

func (f *fakeUserStore) SearchByUsername(_ context.Context, q, exclude string) ([]User, error) {
	f.gotQuery, f.gotExcluded = q, exclude
	return f.users, nil
}

func (f *fakeUserStore) GetBirthday(context.Context, string) (*Birthday, error) {
	return &Birthday{}, nil
}
func (f *fakeUserStore) SetBirthday(context.Context, string, Birthday) error { return f.birthdayErr }
func (f *fakeUserStore) UpdatePrivacy(_ context.Context, id string, p Privacy) (*User, error) {
	if !ValidFriendPolicy(p.FriendRequestPolicy) {
		return nil, ErrInvalidPrivacy
	}
	for i := range f.users {
		if f.users[i].ID == id {
			f.users[i].FriendRequestPolicy, f.users[i].AllowServerDMs = p.FriendRequestPolicy, p.AllowServerDMs
			u := f.users[i]
			return &u, nil
		}
	}
	return nil, errors.New("not found")
}

func userRouter(store userStore) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := &Handler{service: store}
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("userID", meID); c.Next() })
	router.GET("/users/me", h.GetMe)
	router.GET("/users/search", h.SearchUsers)
	router.GET("/users/me/privacy", h.GetPrivacy)
	router.PUT("/users/me/privacy", h.UpdatePrivacy)
	return router
}

func TestSearchUsersHidesEmail(t *testing.T) {
	store := &fakeUserStore{users: []User{
		{ID: otherID, Username: "baal", DisplayName: "Baal", Email: "b@x.com"},
		{ID: "u3", Username: "baal_2", DisplayName: "B2", Email: "b2@x.com"},
	}}
	rec := httptest.NewRecorder()
	userRouter(store).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/users/search?username=baa", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d", rec.Code)
	}
	assertNoEmail(t, "GET /users/search", rec.Body.Bytes(), "b@x.com")
	assertNoEmail(t, "GET /users/search", rec.Body.Bytes(), "b2@x.com")
	if !strings.Contains(rec.Body.String(), `"username":"baal"`) {
		t.Errorf("busca perdeu o username: %s", rec.Body.String())
	}
	if store.gotExcluded != meID {
		t.Errorf("busca não exclui quem buscou: %q", store.gotExcluded)
	}
}

func TestGetMeKeepsOwnEmail(t *testing.T) {
	store := &fakeUserStore{users: []User{{ID: meID, Username: "mugis", Email: "m@x.com", Links: []ProfileLink{}}}}
	rec := httptest.NewRecorder()
	userRouter(store).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/users/me", nil))
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"email":"m@x.com"`) {
		t.Fatalf("GET /users/me = %d %s, want o próprio e-mail", rec.Code, rec.Body.String())
	}
}

func TestEscapeLike(t *testing.T) {
	cases := map[string]string{
		"baal":     "baal",
		"_":        `\_`,
		"%":        `\%`,
		`a\b`:      `a\\b`,
		`50%_off\`: `50\%\_off\\`,
		"":         "",
	}
	for in, want := range cases {
		if got := escapeLike(in); got != want {
			t.Errorf("escapeLike(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestPrivacyRoundTrip(t *testing.T) {
	store := &fakeUserStore{users: []User{{ID: meID, Username: "eu", FriendRequestPolicy: FriendPolicyEveryone, AllowServerDMs: true}}}
	router := userRouter(store)

	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/users/me/privacy",
		strings.NewReader(`{"friend_request_policy":"mutual_servers","allow_server_dms":false}`)))
	if rec.Code != http.StatusOK {
		t.Fatalf("PUT status = %d: %s", rec.Code, rec.Body.String())
	}

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/users/me/privacy", nil))
	var got Privacy
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.FriendRequestPolicy != FriendPolicyMutualServers || got.AllowServerDMs {
		t.Errorf("privacidade não gravou: %+v", got)
	}

	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, httptest.NewRequest(http.MethodPut, "/users/me/privacy",
		strings.NewReader(`{"friend_request_policy":"qualquer"}`)))
	if rec.Code != http.StatusBadRequest {
		t.Errorf("política inválida: status = %d, want 400", rec.Code)
	}
}

func TestPrivacyNotInPublicJSON(t *testing.T) {
	u := User{ID: "x", FriendRequestPolicy: FriendPolicyNobody, AllowServerDMs: true}
	raw, _ := json.Marshal(u)
	if strings.Contains(string(raw), "friend_request_policy") || strings.Contains(string(raw), "allow_server_dms") {
		t.Errorf("privacidade vazou no JSON público: %s", raw)
	}
}
