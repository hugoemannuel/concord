package channelcategory

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/role"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Categoria privada num Postgres de verdade, pelas rotas de verdade. O que importa:
// quem não vê a categoria não acha nome, canal nem id dela em nenhuma resposta, e
// não consegue mexer nela nem sabendo o id.

type securityScene struct {
	t        *testing.T
	db       *pgxpool.Pool
	ctx      context.Context
	router   *gin.Engine
	perms    *permission.Service
	server   string
	everyone string
	vip      string
	users    map[string]string
	acting   string
	repo     *Repository
}

func (s *securityScene) exec(sql string, args ...any) {
	s.t.Helper()
	if _, err := s.db.Exec(s.ctx, sql, args...); err != nil {
		s.t.Fatalf("%s: %v", sql, err)
	}
}

func newSecurityScene(t *testing.T) *securityScene {
	t.Helper()
	gin.SetMode(gin.TestMode)
	db, ctx := categoryTestDB(t)
	s := &securityScene{t: t, db: db, ctx: ctx, server: uuid.NewString(), everyone: uuid.NewString(), vip: uuid.NewString(), users: map[string]string{}, repo: NewRepository(db)}
	for _, name := range []string{"dono", "ana", "bia", "chefe", "gerente"} {
		id := uuid.NewString()
		s.users[name] = id
		s.exec(`INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, id, name+id[:8], id[:8]+"@teste.dev")
		t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, id) })
	}
	s.exec(`INSERT INTO servers(id,name,owner_id) VALUES($1,'s',$2)`, s.server, s.users["dono"])
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM servers WHERE id=$1`, s.server) })
	s.exec(`DELETE FROM roles WHERE server_id=$1`, s.server)
	role := func(id, name string, position int, perms int64, isDefault bool) {
		s.exec(`INSERT INTO roles(id,server_id,name,position,permissions,is_default) VALUES($1,$2,$3,$4,$5,$6)`, id, s.server, name, position, perms, isDefault)
	}
	admin, manager := uuid.NewString(), uuid.NewString()
	role(s.everyone, "@everyone", 0, permission.DefaultEveryone, true)
	role(s.vip, "vip", 1, 0, false)
	role(admin, "admin", 2, permission.Administrator, false)
	role(manager, "gerencia", 3, permission.ManageChannels|permission.ManageRoles, false)
	for _, name := range []string{"dono", "ana", "bia", "chefe", "gerente"} {
		s.exec(`INSERT INTO server_members(server_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, s.server, s.users[name])
	}
	giveRole := func(user, role string) {
		s.exec(`INSERT INTO member_roles(server_id,user_id,role_id) VALUES($1,$2,$3)`, s.server, s.users[user], role)
	}
	giveRole("ana", s.vip)
	giveRole("chefe", admin)
	giveRole("gerente", manager)

	s.perms = permission.PermissionService(permission.PermissionRepository(db))
	channels := channel.ChannelService(channel.ChannelRepository(db), nil)
	channels.SetPermissionCache(s.perms)
	handler := NewHandler(s.repo, s.perms, nil)
	handler.SetPermissionCache(s.perms)
	s.router = gin.New()
	auth := func(c *gin.Context) { c.Set("userID", s.users[s.acting]); c.Next() }
	api := s.router.Group("/api")
	Routes(api, handler, auth)
	channel.ChannelRoutes(api, channel.ChannelHandler(channels, s.perms), auth)
	return s
}

func (s *securityScene) request(user, method, path, body string) *httptest.ResponseRecorder {
	s.t.Helper()
	s.acting = user
	r := httptest.NewRequest(method, "/api/servers/"+s.server+path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	s.router.ServeHTTP(w, r)
	return w
}

func (s *securityScene) want(status int, w *httptest.ResponseRecorder) {
	s.t.Helper()
	if w.Code != status {
		s.t.Fatalf("status %d, esperado %d: %s", w.Code, status, w.Body.String())
	}
}

// layoutOf: a barra como o membro a recebe.
func (s *securityScene) layoutOf(user string) Layout {
	s.t.Helper()
	w := s.request(user, http.MethodGet, "/categories", "")
	s.want(200, w)
	var layout Layout
	if err := json.Unmarshal(w.Body.Bytes(), &layout); err != nil {
		s.t.Fatal(err)
	}
	return layout
}

func (s *securityScene) categoryID(name string) string {
	s.t.Helper()
	for _, category := range s.layoutOf("dono").Categories {
		if category.Name == name {
			return category.ID
		}
	}
	s.t.Fatalf("categoria %q não existe", name)
	return ""
}

func (s *securityScene) privateCategory(name string) string {
	s.t.Helper()
	s.want(204, s.request("dono", http.MethodPost, "/categories", `{"name":"`+name+`","private":true,"role_ids":["`+s.vip+`"]}`))
	return s.categoryID(name)
}

func (s *securityScene) newChannel(name, kind, category string) string {
	s.t.Helper()
	body := `{"name":"` + name + `","type":"` + kind + `"}`
	if category != "" {
		body = `{"name":"` + name + `","type":"` + kind + `","category_id":"` + category + `"}`
	}
	w := s.request("dono", http.MethodPost, "/channels", body)
	s.want(201, w)
	var created struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		s.t.Fatal(err)
	}
	return created.ID
}

// assertHidden: nada do segredo em nenhuma lista que o membro recebe.
func (s *securityScene) assertHidden(user string, secrets ...string) {
	s.t.Helper()
	for _, path := range []string{"/categories", "/channels"} {
		w := s.request(user, http.MethodGet, path, "")
		s.want(200, w)
		for _, secret := range secrets {
			if strings.Contains(w.Body.String(), secret) {
				s.t.Fatalf("%s recebeu %q em %s: %s", user, secret, path, w.Body.String())
			}
		}
	}
}

func (s *securityScene) assertVisible(user string, secrets ...string) {
	s.t.Helper()
	all := s.request(user, http.MethodGet, "/categories", "").Body.String() + s.request(user, http.MethodGet, "/channels", "").Body.String()
	for _, secret := range secrets {
		if !strings.Contains(all, secret) {
			s.t.Fatalf("%s não recebeu %q: %s", user, secret, all)
		}
	}
}

func TestPrivateCategoryDoesNotLeak(t *testing.T) {
	s := newSecurityScene(t)
	id := s.privateCategory("Segredos do RH")
	text := s.newChannel("salarios", "text", id)
	voice := s.newChannel("reuniao", "voice", id)
	secrets := []string{"Segredos do RH", id, text, voice, "salarios", "reuniao"}
	s.assertHidden("bia", secrets...)
	// Gerenciar canais não dá acesso ao que a pessoa não pode ver.
	s.assertHidden("gerente", secrets...)
	for _, user := range []string{"ana", "dono", "chefe"} {
		s.assertVisible(user, secrets...)
	}
	snap, err := s.perms.Snapshot(s.ctx, s.server)
	if err != nil {
		t.Fatal(err)
	}
	for _, channelID := range []string{text, voice} {
		if snap.CanView(channelID, s.users["bia"]) || snap.Channel(channelID, s.users["bia"]) != 0 {
			t.Fatalf("bia tem acesso a %s", channelID)
		}
		if !snap.CanView(channelID, s.users["ana"]) {
			t.Fatalf("ana perdeu %s", channelID)
		}
	}
	if perms := snap.Channel(voice, s.users["ana"]); !permission.Has(perms, permission.Connect) {
		t.Fatalf("ana não conecta na voz: %d", perms)
	}
}

func TestHiddenCategoryIsNotFoundEvenWithPermission(t *testing.T) {
	s := newSecurityScene(t)
	id := s.privateCategory("Segredos")
	hidden := s.newChannel("salarios", "text", id)
	loose := s.newChannel("geral", "text", "")
	everyoneRule := "/overwrites/role/" + s.everyone
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodPut, "/categories/" + id, `{"name":"Tomada"}`},
		{http.MethodPut, "/categories/" + id, `{"name":"Tomada","private":false}`},
		{http.MethodDelete, "/categories/" + id, ""},
		{http.MethodPut, "/categories/" + id + "/order", `{"direction":"up"}`},
		{http.MethodPut, "/categories/" + id + everyoneRule, `{"allow":1,"deny":0}`},
		{http.MethodDelete, "/categories/" + id + everyoneRule, ""},
		{http.MethodPut, "/categories/channels/" + hidden, `{"category_id":null}`},
		{http.MethodPut, "/categories/channels/" + loose, `{"category_id":"` + id + `"}`},
		{http.MethodPut, "/categories/channels/" + loose, `{"before_id":"` + hidden + `"}`},
		{http.MethodPost, "/categories/channels/" + hidden + "/sync", ""},
		{http.MethodPost, "/channels", `{"name":"intruso","type":"text","category_id":"` + id + `"}`},
		{http.MethodPut, "/channels/" + hidden, `{"name":"tomado"}`},
		{http.MethodDelete, "/channels/" + hidden, ""},
		{http.MethodPut, "/channels/" + hidden + everyoneRule, `{"allow":1,"deny":0}`},
	} {
		s.want(http.StatusNotFound, s.request("gerente", tc.method, tc.path, tc.body))
	}
	// Nada mudou.
	s.assertVisible("ana", "Segredos", hidden)
	s.assertHidden("bia", "Segredos", hidden)
	s.assertHidden("gerente", "Segredos", hidden)
}

func TestManageChannelsIsRequiredOnEveryRoute(t *testing.T) {
	s := newSecurityScene(t)
	id := s.newChannel("geral", "text", "")
	s.want(204, s.request("dono", http.MethodPost, "/categories", `{"name":"Aberta"}`))
	category := s.categoryID("Aberta")
	for _, tc := range []struct{ method, path, body string }{
		{http.MethodPost, "/categories", `{"name":"Nova"}`},
		{http.MethodPut, "/categories/" + category, `{"name":"Nova"}`},
		{http.MethodDelete, "/categories/" + category, ""},
		{http.MethodPut, "/categories/" + category + "/order", `{"direction":"up"}`},
		{http.MethodPut, "/categories/layout", `{"revision":"x","categories":[],"channels":[]}`},
		{http.MethodPut, "/categories/" + category + "/overwrites/role/" + s.everyone, `{"allow":0,"deny":1}`},
		{http.MethodDelete, "/categories/" + category + "/overwrites/role/" + s.everyone, ""},
		{http.MethodPut, "/categories/channels/" + id, `{"category_id":"` + category + `"}`},
		{http.MethodPost, "/categories/channels/" + id + "/sync", ""},
	} {
		s.want(http.StatusForbidden, s.request("bia", tc.method, tc.path, tc.body))
	}
}

func TestChannelsFollowTheCategory(t *testing.T) {
	s := newSecurityScene(t)
	s.want(204, s.request("dono", http.MethodPost, "/categories", `{"name":"Jogos"}`))
	id := s.categoryID("Jogos")
	linked := s.newChannel("cs", "text", id)
	own := s.newChannel("lol", "voice", id)
	s.want(200, s.request("dono", http.MethodPut, "/channels/"+own+"/overwrites/role/"+s.vip, `{"allow":0,"deny":256}`))

	synced := func() map[string]bool {
		out := map[string]bool{}
		for _, placement := range s.layoutOf("dono").Channels {
			out[placement.ChannelID] = placement.Synced
		}
		return out
	}
	if got := synced(); !got[linked] || got[own] {
		t.Fatalf("vinculados: %v", got)
	}

	// Virou privada: os dois somem para quem não pode ver, mesmo o de permissão própria.
	s.want(204, s.request("dono", http.MethodPut, "/categories/"+id, `{"name":"Jogos","private":true,"role_ids":["`+s.vip+`"]}`))
	s.assertHidden("bia", "Jogos", linked, own)
	s.assertVisible("ana", "Jogos", linked, own)
	if got := synced(); !got[linked] || got[own] {
		t.Fatalf("depois de privada: %v", got)
	}

	// Sincronizar de novo: o canal perde as regras próprias e passa a seguir a categoria.
	s.want(204, s.request("dono", http.MethodPost, "/categories/channels/"+own+"/sync", ""))
	if got := synced(); !got[own] {
		t.Fatalf("depois de sincronizar: %v", got)
	}

	// Voltou a ser pública: quem segue a categoria abre junto.
	s.want(204, s.request("dono", http.MethodPut, "/categories/"+id, `{"name":"Jogos","private":false}`))
	s.assertVisible("bia", "Jogos", linked, own)
}

func TestMovingAChannelNeverOpensIt(t *testing.T) {
	s := newSecurityScene(t)
	secret := s.privateCategory("Segredos")
	s.want(204, s.request("dono", http.MethodPost, "/categories", `{"name":"Aberta"}`))
	open := s.categoryID("Aberta")
	channelID := s.newChannel("geral", "text", "")
	move := func(to string) {
		t.Helper()
		body := `{"category_id":null}`
		if to != "" {
			body = `{"category_id":"` + to + `"}`
		}
		s.want(204, s.request("dono", http.MethodPut, "/categories/channels/"+channelID, body))
	}
	move(secret)
	s.assertHidden("bia", channelID)
	s.assertVisible("ana", channelID)
	move(open)
	s.assertHidden("bia", channelID)
	move("")
	s.assertHidden("bia", channelID)
	// Abrir é explícito: sincronizar com a categoria aberta.
	move(open)
	s.want(204, s.request("dono", http.MethodPost, "/categories/channels/"+channelID+"/sync", ""))
	s.assertVisible("bia", channelID)
}

func TestDeletingAPrivateCategoryKeepsChannelsClosed(t *testing.T) {
	s := newSecurityScene(t)
	id := s.privateCategory("Segredos")
	linked := s.newChannel("a", "text", id)
	own := s.newChannel("b", "text", id)
	// Permissão própria abre para todo mundo no canal, mas a categoria ainda fecha.
	s.want(200, s.request("dono", http.MethodPut, "/channels/"+own+"/overwrites/role/"+s.everyone, `{"allow":1,"deny":0}`))
	s.assertHidden("bia", linked, own)
	loose := s.newChannel("solto", "voice", "")
	s.want(204, s.request("dono", http.MethodDelete, "/categories/"+id, ""))
	layout := s.layoutOf("dono")
	if len(layout.Categories) != 0 {
		t.Fatalf("categorias: %+v", layout.Categories)
	}
	order := map[string]int{}
	for _, placement := range layout.Channels {
		if placement.CategoryID != nil {
			t.Fatalf("canal ainda em categoria: %+v", placement)
		}
		order[placement.ChannelID] = placement.Position
	}
	if !(order[loose] < order[linked] && order[linked] < order[own]) {
		t.Fatalf("soltos no fim, na ordem da categoria: %v", order)
	}
	// Nenhum canal foi apagado e nenhum abriu.
	s.assertHidden("bia", linked, own)
	s.assertVisible("ana", linked)
	s.assertVisible("bia", loose)
}

func TestLayoutRespectsWhoCannotSeeTheCategory(t *testing.T) {
	s := newSecurityScene(t)
	s.want(204, s.request("dono", http.MethodPost, "/categories", `{"name":"Um"}`))
	secret := s.privateCategory("Segredos")
	s.want(204, s.request("dono", http.MethodPost, "/categories", `{"name":"Dois"}`))
	um, dois := s.categoryID("Um"), s.categoryID("Dois")
	hidden := s.newChannel("salarios", "text", secret)
	free := s.newChannel("geral", "text", "")

	seen := s.layoutOf("gerente")
	body := func(categories []string, category *string) string {
		raw, err := json.Marshal(LayoutWrite{
			Revision:   seen.Revision,
			Categories: categories,
			Channels:   []Placement{{ChannelID: free, CategoryID: category}},
		})
		if err != nil {
			t.Fatal(err)
		}
		return string(raw)
	}
	// Citar o que não vê é recusado, sem dizer se existe.
	s.want(400, s.request("gerente", http.MethodPut, "/categories/layout", body([]string{um, dois, secret}, nil)))
	s.want(400, s.request("gerente", http.MethodPut, "/categories/layout", body([]string{um, dois}, &secret)))
	// Trocar a ordem do que vê não mexe na categoria oculta nem no canal dela.
	s.want(200, s.request("gerente", http.MethodPut, "/categories/layout", body([]string{dois, um}, &um)))
	layout := s.layoutOf("dono")
	names := []string{}
	for _, category := range layout.Categories {
		names = append(names, category.Name)
	}
	if strings.Join(names, ",") != "Dois,Segredos,Um" {
		t.Fatalf("ordem: %v", names)
	}
	for _, placement := range layout.Channels {
		if placement.ChannelID == hidden && (placement.CategoryID == nil || *placement.CategoryID != secret) {
			t.Fatalf("canal oculto saiu do lugar: %+v", placement)
		}
	}
}

func TestLooseChannelsShareOneOrderWithOldAppsReordering(t *testing.T) {
	s := newSecurityScene(t)
	t1 := s.newChannel("t1", "text", "")
	v1 := s.newChannel("v1", "voice", "")
	t2 := s.newChannel("t2", "text", "")
	v2 := s.newChannel("v2", "voice", "")
	order := func() string {
		names := []string{}
		for _, placement := range s.layoutOf("dono").Channels {
			names = append(names, placement.ChannelID)
		}
		return strings.Join(names, ",")
	}
	if got := order(); got != strings.Join([]string{t1, v1, t2, v2}, ",") {
		t.Fatalf("texto e voz misturados na ordem de criação: %s", got)
	}
	// Um app antigo reordena só os de texto: eles trocam entre si, a voz fica onde estava.
	s.want(200, s.request("dono", http.MethodPut, "/channels/order", `{"type":"text","channel_ids":["`+t2+`","`+t1+`"]}`))
	if got := order(); got != strings.Join([]string{t2, v1, t1, v2}, ",") {
		t.Fatalf("depois do app antigo: %s", got)
	}
}

func TestDeletingARoleAlsoLeavesTheCategory(t *testing.T) {
	s := newSecurityScene(t)
	id := s.privateCategory("Segredos")
	if err := role.RoleRepository(s.db).Delete(s.ctx, s.server, s.vip); err != nil {
		t.Fatal(err)
	}
	s.perms.InvalidateServer(s.server)
	s.assertHidden("ana", "Segredos", id)
	var rows int
	if err := s.db.QueryRow(s.ctx, `SELECT COUNT(*) FROM category_overwrites WHERE target_id=$1`, s.vip).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("sobraram %d regras (%v)", rows, err)
	}
}

func TestCreateDefaultsPutsChannelsInBoth(t *testing.T) {
	s := newSecurityScene(t)
	geral := s.newChannel("geral", "text", "")
	musica := s.newChannel("musica", "text", "")
	if err := s.repo.CreateDefaults(s.ctx, s.server); err != nil {
		t.Fatal(err)
	}
	layout := s.layoutOf("dono")
	if len(layout.Categories) != 2 || layout.Categories[0].Name != DefaultTextCategory || layout.Categories[1].Name != DefaultVoiceCategory {
		t.Fatalf("categorias: %+v", layout.Categories)
	}
	for i, id := range []string{geral, musica} {
		placement := layout.Channels[i]
		if placement.ChannelID != id || placement.CategoryID == nil || *placement.CategoryID != layout.Categories[0].ID {
			t.Fatalf("canal %d: %+v", i, placement)
		}
	}
}
