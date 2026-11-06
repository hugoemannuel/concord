package soundboard

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
)

// ListForUser do fake: os sons agrupados por servidor (o fake não sabe de membros).
func (r *fakeRepo) ListForUser(_ context.Context, _ string) ([]ServerSounds, error) {
	byServer := map[string][]Sound{}
	for _, s := range r.sounds {
		byServer[s.ServerID] = append(byServer[s.ServerID], s)
	}
	groups := make([]ServerSounds, 0, len(byServer))
	for id, sounds := range byServer {
		groups = append(groups, ServerSounds{ServerID: id, ServerName: "Servidor " + id, Sounds: sounds})
	}
	sort.Slice(groups, func(i, j int) bool { return groups[i].ServerID < groups[j].ServerID })
	return groups, nil
}

func TestListMineGroupsSoundsByServer(t *testing.T) {
	r, _, repo, _ := setupTestRouter(t)
	repo.sounds["a"] = Sound{ID: "a", ServerID: "srv-a", Name: "Buzina"}
	repo.sounds["b"] = Sound{ID: "b", ServerID: "srv-b", Name: "Apito"}

	req := httptest.NewRequest(http.MethodGet, "/api/soundboard", nil)
	req.Header.Set("X-User-ID", "user-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	var groups []ServerSounds
	if err := json.Unmarshal(w.Body.Bytes(), &groups); err != nil {
		t.Fatal(err)
	}
	if len(groups) != 2 || groups[0].ServerID != "srv-a" || groups[1].Sounds[0].Name != "Apito" {
		t.Fatalf("groups = %+v", groups)
	}
}

func TestListMineNeedsLogin(t *testing.T) {
	r, _, _, _ := setupTestRouter(t)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/soundboard", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", w.Code)
	}
}

// A rota da lista não engole a do arquivo (que não pede login, só o media token).
func TestListMineKeepsFileRoute(t *testing.T) {
	r, _, _, _ := setupTestRouter(t)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/soundboard/x/file", nil))
	if w.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 (sem media token)", w.Code)
	}
}

func TestCallLookupIsMember(t *testing.T) {
	srv := &fakeServers{members: map[string]bool{"user-1": true}}
	lookup := NewCallLookup(newFakeRepo(), nil, srv)
	ctx := context.Background()
	if ok, err := lookup.IsMember(ctx, "srv", "user-1"); err != nil || !ok {
		t.Fatalf("membro: ok=%v err=%v", ok, err)
	}
	if ok, _ := lookup.IsMember(ctx, "srv", "outsider"); ok {
		t.Fatal("quem não é membro não pode")
	}
}
