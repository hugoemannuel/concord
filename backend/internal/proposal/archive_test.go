package proposal

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const (
	idA = "00000000-0000-4000-8000-00000000000a"
	idB = "00000000-0000-4000-8000-00000000000b"
	idC = "00000000-0000-4000-8000-00000000000c"
)

func seed(st *fakeStore, id, status string) {
	st.items[id] = &Proposal{ID: id, AuthorID: "u1", Title: "Card " + id[len(id)-1:], Status: status}
}

func TestArchiveSoTimeTechEStatusValido(t *testing.T) {
	s, st, pub := newTestService(nil)
	ctx := context.Background()
	seed(st, idA, StatusDone)
	seed(st, idB, StatusRejected)
	seed(st, idC, StatusInProgress)

	if _, err := s.Archive(ctx, idA, "u1"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("não-tech: %v", err)
	}
	if st.items[idA].ArchivedAt != nil {
		t.Fatal("não-tech arquivou")
	}
	if _, err := s.Archive(ctx, idC, "tech"); !errors.Is(err, ErrNotArchivable) {
		t.Fatalf("em andamento: %v", err)
	}
	if _, err := s.Archive(ctx, "nao-existe", "tech"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("inexistente: %v", err)
	}
	before := pub.events
	for _, id := range []string{idA, idB} {
		p, err := s.Archive(ctx, id, "tech")
		if err != nil || p.ArchivedAt == nil {
			t.Fatalf("arquivar %s: %v %+v", id, err, p)
		}
	}
	if pub.events != before+2 || !strings.Contains(string(pub.last), `"proposal:archive"`) {
		t.Fatalf("evento: %d %s", pub.events-before, pub.last)
	}
	// Idempotente: arquivar de novo não falha.
	if _, err := s.Archive(ctx, idA, "tech"); err != nil {
		t.Fatalf("de novo: %v", err)
	}
}

func TestArchiveAllEmLote(t *testing.T) {
	s, st, pub := newTestService(nil)
	ctx := context.Background()
	seed(st, idA, StatusDone)
	seed(st, idB, StatusDone)
	seed(st, idC, StatusRejected)

	if _, err := s.ArchiveAll(ctx, "u1", StatusDone); !errors.Is(err, ErrForbidden) {
		t.Fatalf("não-tech: %v", err)
	}
	if _, err := s.ArchiveAll(ctx, "tech", StatusInProgress); !errors.Is(err, ErrInvalidStatus) {
		t.Fatalf("status inválido: %v", err)
	}
	got, err := s.ArchiveAll(ctx, "tech", StatusDone)
	if err != nil || len(got) != 2 || st.items[idC].ArchivedAt != nil {
		t.Fatalf("lote: %v %v (recusada ficou?)", got, err)
	}
	if pub.events != 1 || !strings.Contains(string(pub.last), idA) || !strings.Contains(string(pub.last), idB) {
		t.Fatalf("um evento só com os ids: %d %s", pub.events, pub.last)
	}
	// Nada a arquivar: nenhum evento.
	pub.events = 0
	if got, _ := s.ArchiveAll(ctx, "tech", StatusDone); len(got) != 0 || pub.events != 0 {
		t.Fatalf("segunda rodada: %v eventos=%d", got, pub.events)
	}
}

func TestUnarchiveEMoverArquivadaExigeDesarquivar(t *testing.T) {
	s, st, pub := newTestService(nil)
	ctx := context.Background()
	seed(st, idA, StatusDone)
	if _, err := s.Archive(ctx, idA, "tech"); err != nil {
		t.Fatal(err)
	}
	// Decisão: card arquivado não muda de coluna; desarquive primeiro.
	if _, err := s.SetStatus(ctx, idA, "tech", StatusProposed, false); !errors.Is(err, ErrArchived) {
		t.Fatalf("mover arquivada: %v", err)
	}
	if _, err := s.Unarchive(ctx, idA, "u1"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("não-tech desarquivou: %v", err)
	}
	p, err := s.Unarchive(ctx, idA, "tech")
	if err != nil || p.ArchivedAt != nil || !strings.Contains(string(pub.last), `"proposal:unarchive"`) {
		t.Fatalf("desarquivar: %v %+v %s", err, p, pub.last)
	}
	if _, err := s.SetStatus(ctx, idA, "tech", StatusProposed, false); err != nil {
		t.Fatalf("mover depois de desarquivar: %v", err)
	}
}

func TestArchivedLeituraAbertaEPaginada(t *testing.T) {
	s, st, _ := newTestService(nil)
	ctx := context.Background()
	for _, id := range []string{idA, idB, idC} {
		seed(st, id, StatusDone)
	}
	s.ArchiveAll(ctx, "tech", StatusDone)
	page, err := s.Archived(ctx, "u1", "", 0)
	if err != nil || len(page.Proposals) != 3 || page.HasMore {
		t.Fatalf("página 0: %+v %v", page, err)
	}
	search, _ := s.Archived(ctx, "u1", "card b", 0)
	if len(search.Proposals) != 1 || search.Proposals[0].ID != idB {
		t.Fatalf("busca: %+v", search)
	}
	if _, err := s.Archived(ctx, "u1", "", -1); err != nil {
		t.Fatalf("página negativa vira 0: %v", err)
	}
}

func archiveReq(r http.Handler, method, path, user string, body any) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	req.Header.Set("X-User", user)
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec
}

func TestArchiveEndpoints(t *testing.T) {
	r, st := newTestRouter(t)
	seed(st, idA, StatusDone)
	seed(st, idB, StatusInProgress)
	seed(st, idC, StatusDone)

	cases := []struct {
		name         string
		method, path string
		user         string
		body         any
		want         int
	}{
		{"não-tech arquivar", "PUT", "/api/proposals/" + idA + "/archive", "u1", nil, 403},
		{"não-tech em lote", "POST", "/api/proposals/archive-all", "u1", map[string]string{"status": "done"}, 403},
		{"não-tech desarquivar", "DELETE", "/api/proposals/" + idA + "/archive", "u1", nil, 403},
		{"status inválido: 409", "PUT", "/api/proposals/" + idB + "/archive", "tech", nil, 409},
		{"id ruim", "PUT", "/api/proposals/xx/archive", "tech", nil, 400},
		{"inexistente", "PUT", "/api/proposals/00000000-0000-4000-8000-0000000000ff/archive", "tech", nil, 404},
		{"lote com status inválido", "POST", "/api/proposals/archive-all", "tech", map[string]string{"status": "voting"}, 400},
		{"arquivar", "PUT", "/api/proposals/" + idA + "/archive", "tech", nil, 200},
		{"lote (padrão: concluídas)", "POST", "/api/proposals/archive-all", "tech", map[string]string{}, 200},
		{"arquivadas: qualquer pessoa lê", "GET", "/api/proposals/archived", "u1", nil, 200},
		{"quadro sem arquivadas", "GET", "/api/proposals", "u1", nil, 200},
		{"desarquivar", "DELETE", "/api/proposals/" + idA + "/archive", "tech", nil, 200},
	}
	for _, c := range cases {
		if rec := archiveReq(r, c.method, c.path, c.user, c.body); rec.Code != c.want {
			t.Errorf("%s: %d (quer %d) %s", c.name, rec.Code, c.want, rec.Body)
		}
	}
	rec := archiveReq(r, "GET", "/api/proposals/archived?q=card+c", "u1", nil)
	var page ArchivedPage
	if err := json.Unmarshal(rec.Body.Bytes(), &page); err != nil || len(page.Proposals) != 1 || page.Proposals[0].ID != idC {
		t.Fatalf("lista arquivadas: %s %v", rec.Body, err)
	}
}

// Mover card arquivado: 409 "archived" (desarquive primeiro); depois de desarquivar, move.
func TestSetStatusEndpointDeCardArquivado(t *testing.T) {
	r, st := newTestRouter(t)
	seed(st, idA, StatusDone)
	archiveReq(r, "PUT", "/api/proposals/"+idA+"/archive", "tech", nil)

	rec := archiveReq(r, "PATCH", "/api/proposals/"+idA+"/status", "tech", map[string]string{"status": "proposed"})
	if rec.Code != 409 || !strings.Contains(rec.Body.String(), `"archived"`) {
		t.Fatalf("mover arquivada: %d %s", rec.Code, rec.Body)
	}
	archiveReq(r, "DELETE", "/api/proposals/"+idA+"/archive", "tech", nil)
	if rec := archiveReq(r, "PATCH", "/api/proposals/"+idA+"/status", "tech", map[string]string{"status": "proposed"}); rec.Code != 200 {
		t.Fatalf("mover depois de desarquivar: %d %s", rec.Code, rec.Body)
	}
	if rec := archiveReq(r, "PATCH", "/api/proposals/"+idA+"/status", "u1", map[string]string{"status": "done"}); rec.Code != 403 {
		t.Fatalf("não-tech: %d", rec.Code)
	}
}
