package serverprofile

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/user"

	"github.com/gin-gonic/gin"
)

const testServer = "0b6d1c9e-6c1a-4f53-9f7d-1a2b3c4d5e6f"

type fakeCards struct {
	card    *Card
	err     error
	patched *Patch
	code    string
}

func (f *fakeCards) Card(_ context.Context, id, _, code string) (*Card, error) {
	f.code = code
	return f.card, f.err
}

func (f *fakeCards) CardByInvite(context.Context, string, string) (*Card, error) {
	return f.card, f.err
}

func (f *fakeCards) Update(_ context.Context, _, _ string, p Patch) (*Card, error) {
	f.patched = &p
	return f.card, f.err
}

type fakePerms struct{ err error }

func (f fakePerms) Require(context.Context, string, string, int64) error { return f.err }

type fakeGames struct {
	games []Game
	err   error
}

func (f fakeGames) MemberGames(context.Context, string, int) ([]Game, error) { return f.games, f.err }

type fakeMedia struct {
	url string
}

func (f fakeMedia) UploadImage(c *gin.Context, apply user.ImageApply) {
	url := f.url
	apply(c.Request.Context(), "u", &url)
}

func (f fakeMedia) ServeMedia(c *gin.Context) { c.Status(http.StatusOK) }

type fakeChoices struct {
	tags    map[string]Tag
	err     error
	applied string
	asked   []string
}

func (f *fakeChoices) Lookup(_ context.Context, ids []string) (map[string]Tag, error) {
	f.asked = ids
	return f.tags, f.err
}

func (f *fakeChoices) MyTags(context.Context, string) (*Tag, []TagOption, error) {
	return nil, []TagOption{}, f.err
}

func (f *fakeChoices) Apply(_ context.Context, _, serverID string) (*Tag, error) {
	f.applied = serverID
	if f.err != nil {
		return nil, f.err
	}
	return &Tag{ServerID: serverID}, nil
}

func (f *fakeChoices) Clear(context.Context, string) error { return f.err }

type testAPI struct {
	cards   *fakeCards
	perms   *fakePerms
	games   *fakeGames
	choices *fakeChoices
	media   *fakeMedia
	engine  *gin.Engine
	// logged: o id que os middlewares falsos põem no contexto ("" = recusa).
	logged string
}

func newTestAPI() *testAPI {
	gin.SetMode(gin.TestMode)
	api := &testAPI{
		cards:   &fakeCards{card: &Card{ServerID: testServer, Name: "Salinha"}},
		perms:   &fakePerms{},
		games:   &fakeGames{games: []Game{{Name: "Dota 2"}}},
		choices: &fakeChoices{tags: map[string]Tag{}},
		media:   &fakeMedia{url: "/api/x/" + testServer},
		logged:  "ana",
	}
	auth := func(c *gin.Context) {
		if api.logged == "" {
			c.AbortWithStatus(http.StatusUnauthorized)
			return
		}
		c.Set("userID", api.logged)
	}
	optional := func(c *gin.Context) {
		if api.logged != "" {
			c.Set("userID", api.logged)
		}
	}
	h := NewHandler(api.cards, api.perms, api.games)
	api.engine = gin.New()
	Routes(api.engine.Group("/api"), h, NewTagHandler(api.choices), NewImageHandler(h, api.media), auth, optional)
	return api
}

func (a *testAPI) do(method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	a.engine.ServeHTTP(rec, req)
	return rec
}

// Toda rota de escrita e de leitura restrita exige login.
func TestRotasPedemLogin(t *testing.T) {
	api := newTestAPI()
	api.logged = ""
	for _, r := range [][2]string{
		{"GET", "/api/servers/" + testServer + "/card"},
		{"PUT", "/api/servers/" + testServer + "/profile"},
		{"GET", "/api/servers/" + testServer + "/profile/member-games"},
		{"POST", "/api/servers/" + testServer + "/profile/image"},
		{"POST", "/api/server-tags/lookup"},
		{"GET", "/api/users/me/server-tag"},
		{"PUT", "/api/users/me/server-tag"},
		{"DELETE", "/api/users/me/server-tag"},
	} {
		if rec := api.do(r[0], r[1], "{}"); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s = %d, quer 401", r[0], r[1], rec.Code)
		}
	}
}

// Quem não tem MANAGE_SERVER não edita, não envia imagem nem vê os jogos.
func TestRotasDeEdicaoPedemPermissao(t *testing.T) {
	api := newTestAPI()
	api.perms.err = permission.ErrMissingPermission
	for _, r := range [][2]string{
		{"PUT", "/api/servers/" + testServer + "/profile"},
		{"GET", "/api/servers/" + testServer + "/profile/member-games"},
		{"POST", "/api/servers/" + testServer + "/profile/image"},
	} {
		if rec := api.do(r[0], r[1], `{"description":"x"}`); rec.Code != http.StatusForbidden {
			t.Errorf("%s %s = %d, quer 403", r[0], r[1], rec.Code)
		}
	}
	if api.cards.patched != nil {
		t.Error("gravou sem permissão")
	}
	api.perms.err = errors.New("servidor sumiu")
	if rec := api.do("PUT", "/api/servers/"+testServer+"/profile", "{}"); rec.Code != http.StatusNotFound {
		t.Errorf("sem servidor = %d, quer 404", rec.Code)
	}
	if rec := api.do("PUT", "/api/servers/nao-e-uuid/profile", "{}"); rec.Code != http.StatusNotFound {
		t.Errorf("id ruim = %d, quer 404", rec.Code)
	}
}

func TestGetCard(t *testing.T) {
	api := newTestAPI()
	rec := api.do("GET", "/api/servers/"+testServer+"/card?invite=ABC", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Salinha") {
		t.Fatalf("resposta = %d %s", rec.Code, rec.Body)
	}
	if api.cards.code != "ABC" {
		t.Errorf("código = %q", api.cards.code)
	}
	if rec := api.do("GET", "/api/servers/nao-e-uuid/card", ""); rec.Code != http.StatusNotFound {
		t.Errorf("id ruim = %d", rec.Code)
	}
	api.cards.err = errors.New("banco fora")
	if rec := api.do("GET", "/api/servers/"+testServer+"/card", ""); rec.Code != http.StatusInternalServerError {
		t.Errorf("erro = %d", rec.Code)
	}
}

// O cartão trancado não leva nada além do id e do "trancado".
func TestCardTrancadoNoJSON(t *testing.T) {
	api := newTestAPI()
	api.cards.card = &Card{ServerID: testServer, Locked: true}
	rec := api.do("GET", "/api/servers/"+testServer+"/card", "")
	var got map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"name", "icon_url", "created_at", "profile"} {
		if _, ok := got[field]; ok {
			t.Errorf("%s vazou no perfil privado: %s", field, rec.Body)
		}
	}
	if got["locked"] != true || got["member_count"] != float64(0) || got["online_count"] != float64(0) {
		t.Errorf("cartão = %s", rec.Body)
	}
}

func TestGetInviteCard(t *testing.T) {
	api := newTestAPI()
	api.logged = "" // pública
	if rec := api.do("GET", "/api/invites/ABC/card", ""); rec.Code != http.StatusOK {
		t.Errorf("sem login = %d", rec.Code)
	}
	api.cards.err = ErrInvalidInvite
	if rec := api.do("GET", "/api/invites/ABC/card", ""); rec.Code != http.StatusNotFound {
		t.Errorf("inválido = %d", rec.Code)
	}
	api.cards.err = errors.New("banco fora")
	if rec := api.do("GET", "/api/invites/ABC/card", ""); rec.Code != http.StatusInternalServerError {
		t.Errorf("erro = %d", rec.Code)
	}
}

func TestUpdateProfile(t *testing.T) {
	api := newTestAPI()
	rec := api.do("PUT", "/api/servers/"+testServer+"/profile", `{"description":"oi"}`)
	if rec.Code != http.StatusOK || api.cards.patched == nil || *api.cards.patched.Description != "oi" {
		t.Fatalf("resposta = %d %s", rec.Code, rec.Body)
	}
	if api.cards.patched.Tag != nil || api.cards.patched.Banner != nil {
		t.Errorf("o que não veio mudou: %+v", api.cards.patched)
	}
	if rec := api.do("PUT", "/api/servers/"+testServer+"/profile", `{`); rec.Code != http.StatusBadRequest {
		t.Errorf("corpo ruim = %d", rec.Code)
	}
	huge := `{"description":"` + strings.Repeat("a", MaxPatchBodyBytes) + `"}`
	if rec := api.do("PUT", "/api/servers/"+testServer+"/profile", huge); rec.Code != http.StatusBadRequest {
		t.Errorf("corpo grande = %d", rec.Code)
	}
	api.cards.err = ErrInvalidProfile
	if rec := api.do("PUT", "/api/servers/"+testServer+"/profile", `{}`); rec.Code != http.StatusBadRequest {
		t.Errorf("inválido = %d", rec.Code)
	}
	api.cards.err = errors.New("banco fora")
	if rec := api.do("PUT", "/api/servers/"+testServer+"/profile", `{}`); rec.Code != http.StatusInternalServerError {
		t.Errorf("erro = %d", rec.Code)
	}
}

func TestGetMemberGames(t *testing.T) {
	api := newTestAPI()
	rec := api.do("GET", "/api/servers/"+testServer+"/profile/member-games", "")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "Dota 2") {
		t.Fatalf("resposta = %d %s", rec.Code, rec.Body)
	}
	api.games.err = errors.New("banco fora")
	if rec := api.do("GET", "/api/servers/"+testServer+"/profile/member-games", ""); rec.Code != http.StatusInternalServerError {
		t.Errorf("erro = %d", rec.Code)
	}
}

func TestUploadImagem(t *testing.T) {
	api := newTestAPI()
	rec := api.do("POST", "/api/servers/"+testServer+"/profile/image", "")
	if rec.Code != http.StatusCreated || !strings.Contains(rec.Body.String(), ImagePath+testServer) {
		t.Fatalf("resposta = %d %s", rec.Code, rec.Body)
	}
	// GIF vem com "a_" na frente do id: o fundo não anima.
	api.media.url = "/api/x/a_" + testServer
	if rec := api.do("POST", "/api/servers/"+testServer+"/profile/image", ""); rec.Code != http.StatusUnsupportedMediaType {
		t.Errorf("gif = %d", rec.Code)
	}
}

func TestServirImagemSemLogin(t *testing.T) {
	api := newTestAPI()
	api.logged = ""
	if rec := api.do("GET", "/api/server-profile-images/"+testServer, ""); rec.Code != http.StatusOK {
		t.Errorf("imagem = %d", rec.Code)
	}
}

func TestLookup(t *testing.T) {
	api := newTestAPI()
	api.choices.tags = map[string]Tag{testServer: {Name: "ABC"}}
	rec := api.do("POST", "/api/server-tags/lookup", `{"user_ids":["`+testServer+`","maestro"]}`)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "ABC") {
		t.Fatalf("resposta = %d %s", rec.Code, rec.Body)
	}
	if len(api.choices.asked) != 1 || api.choices.asked[0] != testServer {
		t.Errorf("perguntou %v, quer só as contas", api.choices.asked)
	}
	many, _ := json.Marshal(map[string][]string{"user_ids": make([]string, MaxLookupUsers+1)})
	if rec := api.do("POST", "/api/server-tags/lookup", string(many)); rec.Code != http.StatusBadRequest {
		t.Errorf("ids demais = %d", rec.Code)
	}
	api.choices.err = errors.New("banco fora")
	if rec := api.do("POST", "/api/server-tags/lookup", `{"user_ids":[]}`); rec.Code != http.StatusInternalServerError {
		t.Errorf("erro = %d", rec.Code)
	}
}

func TestMinhaTag(t *testing.T) {
	api := newTestAPI()
	if rec := api.do("GET", "/api/users/me/server-tag", ""); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"options":[]`) {
		t.Errorf("minhas tags = %d %s", rec.Code, rec.Body)
	}
	if rec := api.do("PUT", "/api/users/me/server-tag", `{"server_id":"`+testServer+`"}`); rec.Code != http.StatusOK || api.choices.applied != testServer {
		t.Errorf("aplicar = %d", rec.Code)
	}
	if rec := api.do("PUT", "/api/users/me/server-tag", `{"server_id":"x"}`); rec.Code != http.StatusBadRequest {
		t.Errorf("id ruim = %d", rec.Code)
	}
	if rec := api.do("DELETE", "/api/users/me/server-tag", ""); rec.Code != http.StatusNoContent {
		t.Errorf("tirar = %d", rec.Code)
	}
	for _, c := range []struct {
		err  error
		want int
	}{
		{ErrNotMember, http.StatusForbidden},
		{ErrNoTag, http.StatusNotFound},
		{errors.New("banco fora"), http.StatusInternalServerError},
	} {
		api.choices.err = c.err
		if rec := api.do("PUT", "/api/users/me/server-tag", `{"server_id":"`+testServer+`"}`); rec.Code != c.want {
			t.Errorf("%v = %d, quer %d", c.err, rec.Code, c.want)
		}
	}
	api.choices.err = errors.New("banco fora")
	if rec := api.do("GET", "/api/users/me/server-tag", ""); rec.Code != http.StatusInternalServerError {
		t.Errorf("erro = %d", rec.Code)
	}
	if rec := api.do("DELETE", "/api/users/me/server-tag", ""); rec.Code != http.StatusInternalServerError {
		t.Errorf("erro = %d", rec.Code)
	}
}
