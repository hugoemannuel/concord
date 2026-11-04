package proposal

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMentionsEndpoints(t *testing.T) {
	r, _ := newTestRouter(t)
	cases := []struct {
		name         string
		method, path string
		body         any
		want         int
	}{
		{"listar", "GET", "/api/proposals/mentions", nil, http.StatusOK},
		{"marcar todas (sem corpo)", "POST", "/api/proposals/mentions/seen", nil, http.StatusNoContent},
		{"marcar uma proposta", "POST", "/api/proposals/mentions/seen", map[string]string{"proposal_id": idA}, http.StatusNoContent},
		{"id ruim", "POST", "/api/proposals/mentions/seen", map[string]string{"proposal_id": "xx"}, http.StatusBadRequest},
	}
	for _, c := range cases {
		if rec := archiveReq(r, c.method, c.path, "u1", c.body); rec.Code != c.want {
			t.Errorf("%s: %d (quer %d) %s", c.name, rec.Code, c.want, rec.Body)
		}
	}
	// Corpo que não é JSON.
	req, _ := http.NewRequest("POST", "/api/proposals/mentions/seen", stringsReader("{"))
	req.Header.Set("X-User", "u1")
	rec := doRaw(r, req)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("corpo inválido: %d", rec.Code)
	}
}

func stringsReader(s string) *strings.Reader { return strings.NewReader(s) }

func doRaw(r http.Handler, req *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}
