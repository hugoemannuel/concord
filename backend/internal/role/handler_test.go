package role

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

func request(t *testing.T, userID, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	f, rec := newFake(), &recorder{}
	f.snap.Roles["mod"] = Role{ID: "mod", ServerID: "s1", Name: permission.ModeratorName, Position: 2, Permissions: permission.DefaultModerator}
	f.snap.Roles["bots"] = Role{ID: "bots", ServerID: "s1", Name: permission.BotsRoleName, Position: 1, Hoist: true, IsSystem: true}
	router := gin.New()
	auth := func(c *gin.Context) {
		if userID != "" {
			c.Set("userID", userID)
		}
		c.Next()
	}
	RoleRoutes(router.Group("/api"), RoleHandler(newService(f, f, rec)), auth)

	req := httptest.NewRequest(method, "/api/servers/s1"+path, strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	return w
}

func errorCode(t *testing.T, w *httptest.ResponseRecorder) string {
	t.Helper()
	var body struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &body)
	return body.Code
}

func TestHandlerStatusAndCodes(t *testing.T) {
	cases := []struct {
		name         string
		user         string
		method, path string
		body         string
		status       int
		code         string
	}{
		{"sem login", "", http.MethodGet, "/roles", "", http.StatusUnauthorized, ""},
		{"membro lista", "ana", http.MethodGet, "/roles", "", http.StatusOK, ""},
		{"não membro lista", "zeca", http.MethodGet, "/roles", "", http.StatusForbidden, "not_member"},
		{"membro cria", "ana", http.MethodPost, "/roles", `{"name":"x"}`, http.StatusForbidden, "missing_permission"},
		{"gerente cria", "gerente", http.MethodPost, "/roles", `{"name":"x","color":255}`, http.StatusCreated, ""},
		{"json quebrado", "gerente", http.MethodPost, "/roles", `{"name":`, http.StatusBadRequest, ""},
		{"nome inválido", "gerente", http.MethodPost, "/roles", `{"name":"  "}`, http.StatusBadRequest, "invalid"},
		{"permissão que não tem", "gerente", http.MethodPost, "/roles", `{"permissions":64}`, http.StatusForbidden, "cannot_grant"},
		{"editar acima", "gerente", http.MethodPatch, "/roles/admin", `{"name":"x"}`, http.StatusForbidden, "role_hierarchy"},
		{"editar inexistente", "gerente", http.MethodPatch, "/roles/nada", `{"name":"x"}`, http.StatusNotFound, "role_not_found"},
		{"renomear @everyone", "dono", http.MethodPatch, "/roles/everyone", `{"name":"x"}`, http.StatusBadRequest, "everyone_role"},
		{"apagar @everyone", "dono", http.MethodDelete, "/roles/everyone", "", http.StatusBadRequest, "everyone_role"},
		{"renomear Bots", "dono", http.MethodPatch, "/roles/bots", `{"name":"x"}`, http.StatusForbidden, "bot_role"},
		{"apagar Bots", "dono", http.MethodDelete, "/roles/bots", "", http.StatusForbidden, "bot_role"},
		{"dar Bots a usuário", "dono", http.MethodPut, "/members/ana/roles/bots", "", http.StatusForbidden, "bot_role"},
		{"tirar Bots de membro", "dono", http.MethodDelete, "/members/ana/roles/bots", "", http.StatusForbidden, "bot_role"},
		{"apagar cargo", "gerente", http.MethodDelete, "/roles/vip", "", http.StatusOK, ""},
		{"ordem inválida", "dono", http.MethodPut, "/roles/order", `{"role_ids":["vip"]}`, http.StatusBadRequest, "invalid"},
		{"dar cargo", "gerente", http.MethodPut, "/members/ana/roles/vip", "", http.StatusOK, ""},
		{"dar cargo a quem não é membro", "gerente", http.MethodPut, "/members/zeca/roles/vip", "", http.StatusNotFound, "member_not_found"},
		{"tirar cargo", "gerente", http.MethodDelete, "/members/vip/roles/vip", "", http.StatusOK, ""},
		{"atalho antigo: virar moderador", "dono", http.MethodPut, "/members/ana/role", `{"role":"admin"}`, http.StatusOK, ""},
		{"atalho antigo: cargo inválido", "dono", http.MethodPut, "/members/ana/role", `{"role":"superadmin"}`, http.StatusBadRequest, "invalid"},
		{"atalho antigo: moderador não promove", "ana", http.MethodPut, "/members/vip/role", `{"role":"admin"}`, http.StatusForbidden, "missing_permission"},
	}
	for _, tc := range cases {
		w := request(t, tc.user, tc.method, tc.path, tc.body)
		if w.Code != tc.status {
			t.Errorf("%s: status = %d (%s), want %d", tc.name, w.Code, w.Body.String(), tc.status)
			continue
		}
		if code := errorCode(t, w); code != tc.code {
			t.Errorf("%s: code = %q, want %q", tc.name, code, tc.code)
		}
	}
}

func TestHandlerCreateReturnsRole(t *testing.T) {
	w := request(t, "gerente", http.MethodPost, "/roles", `{"name":"Artistas","color":16711850,"hoist":true,"permissions":256}`)
	var role Role
	if err := json.Unmarshal(w.Body.Bytes(), &role); err != nil {
		t.Fatal(err)
	}
	if role.Name != "Artistas" || role.Color == nil || *role.Color != 16711850 || !role.Hoist || role.Permissions != permission.SendMessages {
		t.Fatalf("role = %+v", role)
	}
}
