package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func newRailLayoutTestRouter(svc *RailLayoutService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	h := NewRailLayoutHandler(svc)
	auth := func(c *gin.Context) {
		c.Set("userID", "u1")
		c.Next()
	}
	RailLayoutRoutes(r.Group("/api"), h, auth)
	return r
}

func TestRailLayoutHandlerGetAndPut(t *testing.T) {
	store := &fakeRailLayoutStore{}
	pub := &fakeUserPublisher{}
	svc := NewRailLayoutService(store, pub)
	router := newRailLayoutTestRouter(svc)

	// GET inicial devolve os servidores na ordem padrão
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/api/users/me/server-layout", nil)
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("GET code = %d, want 200: %s", w.Code, w.Body.String())
	}

	// PUT atualiza com uma pasta e um servidor avulso
	body, _ := json.Marshal(RailLayoutState{
		Items: []RailLayoutItem{
			{Kind: RailItemFolder, ID: "f1", Name: "Meus Jogos", ServerIDs: []string{"s2", "s1"}},
			{Kind: RailItemServer, ServerID: "s3"},
		},
	})
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/users/me/server-layout", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT code = %d, want 200: %s", w.Code, w.Body.String())
	}

	var out RailLayoutState
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(out.Items) != 2 || out.Items[0].Name != "Meus Jogos" {
		t.Errorf("out = %+v", out)
	}

	// PUT com payload inválido devolve 400
	badBody := []byte(`{"items":[{"kind":"invalido"}]}`)
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/users/me/server-layout", bytes.NewReader(badBody))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("PUT inválido code = %d, want 400", w.Code)
	}

	// PUT com JSON quebrado devolve 400
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/users/me/server-layout", bytes.NewReader([]byte(`{`)))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("PUT json inválido code = %d, want 400", w.Code)
	}

	// Erro no store devolve 500 em GET e PUT
	store.err = ErrInvalidCode
	w = httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/users/me/server-layout", nil))
	if w.Code != http.StatusInternalServerError {
		t.Errorf("GET erro store code = %d, want 500", w.Code)
	}
	w = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodPut, "/api/users/me/server-layout", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	router.ServeHTTP(w, req)
	if w.Code != http.StatusInternalServerError {
		t.Errorf("PUT erro store code = %d, want 500", w.Code)
	}
}
