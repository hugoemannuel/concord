package server

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
)

type fakeRailLayoutStore struct {
	items map[string][]RailLayoutItem
	err   error
}

func (f *fakeRailLayoutStore) GetRailLayout(_ context.Context, userID string) ([]RailLayoutItem, error) {
	if f.err != nil {
		return nil, f.err
	}
	return f.items[userID], nil
}

func (f *fakeRailLayoutStore) SetRailLayout(_ context.Context, userID string, items []RailLayoutItem) error {
	if f.err != nil {
		return f.err
	}
	if f.items == nil {
		f.items = map[string][]RailLayoutItem{}
	}
	f.items[userID] = items
	return nil
}

func (f *fakeRailLayoutStore) ListByUserID(_ context.Context, _ string) ([]Server, error) {
	return []Server{
		{ID: "s1", Name: "Alpha"},
		{ID: "s2", Name: "Beta"},
		{ID: "s3", Name: "Gamma"},
	}, nil
}

type fakeUserPublisher struct {
	userID string
	data   []byte
}

func (p *fakeUserPublisher) SendToUser(userID string, event []byte) {
	p.userID = userID
	p.data = event
}

func TestReconcileRailLayout(t *testing.T) {
	tests := []struct {
		name      string
		items     []RailLayoutItem
		serverIDs []string
		want      []RailLayoutItem
	}{
		{
			name:      "sem layout salvo devolve todos os servidores na ordem atual",
			items:     nil,
			serverIDs: []string{"s1", "s2"},
			want: []RailLayoutItem{
				{Kind: RailItemServer, ServerID: "s1"},
				{Kind: RailItemServer, ServerID: "s2"},
			},
		},
		{
			name: "filtra servidores desconhecidos, remove duplicatas e adiciona novos no fim",
			items: []RailLayoutItem{
				{Kind: RailItemFolder, ID: "f1", Name: "  Jogos  ", ServerIDs: []string{"s2", "s999", "s2"}},
				{Kind: RailItemServer, ServerID: "s2"},
				{Kind: RailItemServer, ServerID: "s1"},
			},
			serverIDs: []string{"s1", "s2", "s3"},
			want: []RailLayoutItem{
				{Kind: RailItemFolder, ID: "f1", Name: "Jogos", ServerIDs: []string{"s2"}},
				{Kind: RailItemServer, ServerID: "s1"},
				{Kind: RailItemServer, ServerID: "s3"},
			},
		},
		{
			name: "pasta que fica vazia some e pasta sem nome ganha nome padrão",
			items: []RailLayoutItem{
				{Kind: RailItemFolder, ID: "f-empty", Name: "Vazia", ServerIDs: []string{"s999"}},
				{Kind: RailItemFolder, ID: "f-noname", Name: "   ", ServerIDs: []string{"s1"}},
			},
			serverIDs: []string{"s1"},
			want: []RailLayoutItem{
				{Kind: RailItemFolder, ID: "f-noname", Name: DefaultRailFolderName, ServerIDs: []string{"s1"}},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ReconcileRailLayout(tt.items, tt.serverIDs)
			if len(got) != len(tt.want) {
				t.Fatalf("len = %d, want %d (%+v)", len(got), len(tt.want), got)
			}
			for i := range got {
				if got[i].Kind != tt.want[i].Kind || got[i].ID != tt.want[i].ID || got[i].Name != tt.want[i].Name || got[i].ServerID != tt.want[i].ServerID {
					t.Errorf("item[%d] = %+v, want %+v", i, got[i], tt.want[i])
				}
				if strings.Join(got[i].ServerIDs, ",") != strings.Join(tt.want[i].ServerIDs, ",") {
					t.Errorf("item[%d].ServerIDs = %v, want %v", i, got[i].ServerIDs, tt.want[i].ServerIDs)
				}
			}
		})
	}
}

func TestValidateRailLayout(t *testing.T) {
	if err := ValidateRailLayout([]RailLayoutItem{{Kind: "outro"}}); !errors.Is(err, ErrInvalidRailLayout) {
		t.Errorf("kind inválido: got %v, want ErrInvalidRailLayout", err)
	}
	if err := ValidateRailLayout([]RailLayoutItem{{Kind: RailItemFolder, ID: "", Name: "X", ServerIDs: []string{"s1"}}}); !errors.Is(err, ErrInvalidRailLayout) {
		t.Errorf("pasta sem ID: got %v, want ErrInvalidRailLayout", err)
	}
	longName := strings.Repeat("a", MaxRailFolderNameRunes+1)
	if err := ValidateRailLayout([]RailLayoutItem{{Kind: RailItemFolder, ID: "f1", Name: longName, ServerIDs: []string{"s1"}}}); !errors.Is(err, ErrInvalidRailLayout) {
		t.Errorf("nome longo demais: got %v, want ErrInvalidRailLayout", err)
	}
}

func TestRailLayoutRepositoryHelpers(t *testing.T) {
	items, err := parseRailLayoutRow(nil, pgx.ErrNoRows)
	if err != nil || len(items) != 0 {
		t.Fatalf("ErrNoRows: got %v, %v", items, err)
	}
	if _, err := parseRailLayoutRow(nil, errors.New("db down")); err == nil {
		t.Fatal("esperava erro do banco")
	}
	items, err = parseRailLayoutRow([]byte("invalido"), nil)
	if err != nil || len(items) != 0 {
		t.Fatalf("JSON inválido deve devolver lista vazia: got %v, %v", items, err)
	}
	raw, err := encodeRailLayoutItems(nil)
	if err != nil || string(raw) != "[]" {
		t.Fatalf("encode nil: got %s, %v", string(raw), err)
	}
	raw, err = encodeRailLayoutItems([]RailLayoutItem{{Kind: RailItemServer, ServerID: "s1"}})
	if err != nil {
		t.Fatalf("encode items: %v", err)
	}
	parsed, err := parseRailLayoutRow(raw, nil)
	if err != nil || len(parsed) != 1 || parsed[0].ServerID != "s1" {
		t.Fatalf("parse válido: got %+v, %v", parsed, err)
	}
}

func TestRailLayoutServiceGetAndSave(t *testing.T) {
	store := &fakeRailLayoutStore{}
	pub := &fakeUserPublisher{}
	svc := NewRailLayoutService(store, pub)

	input := []RailLayoutItem{
		{Kind: RailItemFolder, ID: "f1", Name: "Comunidades", ServerIDs: []string{"s3", "s1"}},
		{Kind: RailItemServer, ServerID: "s2"},
	}
	saved, err := svc.Save(context.Background(), "u1", input)
	if err != nil {
		t.Fatalf("Save: %v", err)
	}
	if len(saved) != 2 || saved[0].Name != "Comunidades" {
		t.Fatalf("saved = %+v", saved)
	}
	if pub.userID != "u1" {
		t.Fatalf("pub.userID = %q, want u1", pub.userID)
	}
	var ev struct {
		Type    string          `json:"type"`
		Payload RailLayoutState `json:"payload"`
	}
	if err := json.Unmarshal(pub.data, &ev); err != nil {
		t.Fatalf("unmarshal event: %v", err)
	}
	if ev.Type != "server:layout" || len(ev.Payload.Items) != 2 {
		t.Errorf("evento = %+v", ev)
	}

	got, err := svc.Get(context.Background(), "u1")
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if len(got) != 2 || got[0].ID != "f1" {
		t.Errorf("Get = %+v", got)
	}
}
