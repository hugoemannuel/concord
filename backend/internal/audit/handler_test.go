package audit

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func auditRequest(t *testing.T, l *fakeLister, actor, path string) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	router := gin.New()
	auth := func(c *gin.Context) {
		if actor != "" {
			c.Set("userID", actor)
		}
		c.Next()
	}
	Routes(router.Group("/api"), NewHandler(newTestService(l)), auth)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
	return w
}

func TestHandlerList(t *testing.T) {
	cases := []struct {
		name, actor, path string
		status            int
		code              string
	}{
		{"sem login", "", "/api/servers/" + srv1 + "/audit-log", http.StatusUnauthorized, ""},
		{"sem permissão", "comum", "/api/servers/" + srv1 + "/audit-log", http.StatusForbidden, "missing_permission"},
		{"servidor de outro", "auditor", "/api/servers/" + srv2 + "/audit-log", http.StatusForbidden, "not_member"},
		{"cursor inválido", "auditor", "/api/servers/" + srv1 + "/audit-log?before=abc", http.StatusBadRequest, "invalid_filter"},
		{"limite inválido", "auditor", "/api/servers/" + srv1 + "/audit-log?limit=x", http.StatusBadRequest, "invalid_filter"},
		{"ação desconhecida", "auditor", "/api/servers/" + srv1 + "/audit-log?action=x", http.StatusBadRequest, "invalid_filter"},
		{"ok", "auditor", "/api/servers/" + srv1 + "/audit-log?action=member.kick&before=10&limit=5", http.StatusOK, ""},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			w := auditRequest(t, &fakeLister{entries: []Entry{{ID: 3, Action: MemberKick}}}, tc.actor, tc.path)
			if w.Code != tc.status {
				t.Fatalf("status = %d (%s), quer %d", w.Code, w.Body.String(), tc.status)
			}
			var body map[string]any
			_ = json.Unmarshal(w.Body.Bytes(), &body)
			if tc.code != "" && body["code"] != tc.code {
				t.Fatalf("code = %v, quer %s", body["code"], tc.code)
			}
		})
	}
}

func TestHandlerListRepassaFiltro(t *testing.T) {
	l := &fakeLister{}
	w := auditRequest(t, l, "auditor", "/api/servers/"+srv1+"/audit-log?action=member.ban&actor_id=6f1c1d1e-8a3b-4b8e-9f00-0123456789ab&before=42&limit=10")
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d", w.Code)
	}
	want := Filter{ActorID: "6f1c1d1e-8a3b-4b8e-9f00-0123456789ab", Action: MemberBan, Before: 42, Limit: 11}
	if l.serverID != srv1 || l.filter != want {
		t.Fatalf("filtro = %+v no servidor %s, quer %+v", l.filter, l.serverID, want)
	}
}
