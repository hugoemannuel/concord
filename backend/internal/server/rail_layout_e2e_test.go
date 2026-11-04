package server

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

type multiUserLayoutStore struct {
	layouts map[string][]RailLayoutItem
	servers map[string][]Server
}

func (m *multiUserLayoutStore) GetRailLayout(_ interface{}, userID string) ([]RailLayoutItem, error) {
	return m.layouts[userID], nil
}

func TestRailLayoutEndToEndIsolationAndReconciliation(t *testing.T) {
	gin.SetMode(gin.TestMode)

	storeA := &fakeRailLayoutStore{}
	pub := &fakeUserPublisher{}
	svc := NewRailLayoutService(storeA, pub)

	r := gin.New()
	h := NewRailLayoutHandler(svc)
	r.Use(func(c *gin.Context) {
		uid := c.GetHeader("X-Test-User")
		if uid == "" {
			uid = "user-a"
		}
		c.Set("userID", uid)
		c.Next()
	})
	RailLayoutRoutes(r.Group("/api"), h, func(c *gin.Context) { c.Next() })

	// 1. User A agrupa s3 e s1 numa pasta "Trabalho" e deixa s2 fora
	reqBody, _ := json.Marshal(RailLayoutState{
		Items: []RailLayoutItem{
			{Kind: RailItemFolder, ID: "folder-1", Name: "Trabalho", ServerIDs: []string{"s3", "s1"}},
			{Kind: RailItemServer, ServerID: "s2"},
		},
	})
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, "/api/users/me/server-layout", bytes.NewReader(reqBody))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Test-User", "user-a")
	r.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("PUT user-a code = %d: %s", w.Code, w.Body.String())
	}

	// 2. User B consulta seu próprio layout: continua na ordem padrão s1, s2, s3 (isolamento por usuário)
	wB := httptest.NewRecorder()
	reqB := httptest.NewRequest(http.MethodGet, "/api/users/me/server-layout", nil)
	reqB.Header.Set("X-Test-User", "user-b")
	r.ServeHTTP(wB, reqB)
	if wB.Code != http.StatusOK {
		t.Fatalf("GET user-b code = %d", wB.Code)
	}
	var stateB RailLayoutState
	_ = json.Unmarshal(wB.Body.Bytes(), &stateB)
	if len(stateB.Items) != 3 || stateB.Items[0].ServerID != "s1" || stateB.Items[1].ServerID != "s2" || stateB.Items[2].ServerID != "s3" {
		t.Fatalf("layout de user-b foi afetado indevidamente: %+v", stateB.Items)
	}

	// 3. User A renomeia a pasta "Trabalho" para "Projetos" e reordena s2 para antes da pasta
	renameBody, _ := json.Marshal(RailLayoutState{
		Items: []RailLayoutItem{
			{Kind: RailItemServer, ServerID: "s2"},
			{Kind: RailItemFolder, ID: "folder-1", Name: "Projetos", ServerIDs: []string{"s1", "s3"}},
		},
	})
	wA2 := httptest.NewRecorder()
	reqA2 := httptest.NewRequest(http.MethodPut, "/api/users/me/server-layout", bytes.NewReader(renameBody))
	reqA2.Header.Set("Content-Type", "application/json")
	reqA2.Header.Set("X-Test-User", "user-a")
	r.ServeHTTP(wA2, reqA2)
	if wA2.Code != http.StatusOK {
		t.Fatalf("PUT rename user-a code = %d", wA2.Code)
	}

	// Confere leitura persistida de User A
	wGetA := httptest.NewRecorder()
	reqGetA := httptest.NewRequest(http.MethodGet, "/api/users/me/server-layout", nil)
	reqGetA.Header.Set("X-Test-User", "user-a")
	r.ServeHTTP(wGetA, reqGetA)
	var stateA RailLayoutState
	_ = json.Unmarshal(wGetA.Body.Bytes(), &stateA)
	if len(stateA.Items) != 2 || stateA.Items[0].ServerID != "s2" || stateA.Items[1].Name != "Projetos" {
		t.Fatalf("layout persistido de user-a incorreto: %+v", stateA.Items)
	}
}
