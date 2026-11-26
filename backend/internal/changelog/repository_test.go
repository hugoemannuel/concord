package changelog

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/database"
)

const dedupMigration = "../../migrations/000061_dedup_changelog_entries.up.sql"

// A migration de limpeza num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável): cada nota fica só na release mais antiga que a trouxe.
func TestDedupMigrationKeepsEachNoteInItsFirstRelease(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	run := fmt.Sprint(time.Now().UnixNano())
	repo := NewRepository(db)
	base := time.Now().Add(-time.Hour)
	// Como o deploy fazia: cada versão republica tudo o que veio antes.
	for i, notes := range [][]string{{"A"}, {"A", "B"}, {"A", "B"}} {
		at := base.Add(time.Duration(i) * time.Minute)
		p := Publication{ReleasedAt: &at}
		for _, n := range notes {
			p.Entries = append(p.Entries, Entry{Kind: KindFeature, Text: n + " " + run})
		}
		if err := repo.Upsert(ctx, fmt.Sprintf("9.%s.%d", run, i), p); err != nil {
			t.Fatal(err)
		}
	}
	sql, err := os.ReadFile(dedupMigration)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, string(sql)); err != nil {
		t.Fatal(err)
	}
	releases, err := repo.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string][]Entry{}
	for _, r := range releases {
		got[r.Version] = r.Entries
	}
	want := map[string][]Entry{
		"9." + run + ".0": {{Kind: KindFeature, Text: "A " + run}},
		"9." + run + ".1": {{Kind: KindFeature, Text: "B " + run}},
		"9." + run + ".2": {},
	}
	for v, w := range want {
		if !reflect.DeepEqual(got[v], w) {
			t.Errorf("%s = %+v, quer %+v", v, got[v], w)
		}
	}
}

// A origem da nota precisa sobreviver ao banco: é por ela que o servidor decide
// o que já saiu numa release (Postgres de verdade, TEST_DATABASE_URL).
func TestUpsertAndListKeepEntrySource(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	version := fmt.Sprintf("9.%d.0", time.Now().UnixNano())
	want := []Entry{
		{Kind: KindFeature, Text: "Nova", Source: "2026-10-30-nova.md"},
		{Kind: KindFix, Text: "Antiga, sem origem"},
	}
	if err := repo.Upsert(ctx, version, Publication{Entries: want}); err != nil {
		t.Fatal(err)
	}
	releases, err := repo.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range releases {
		if r.Version == version {
			if !reflect.DeepEqual(r.Entries, want) {
				t.Fatalf("entradas = %+v, quer %+v", r.Entries, want)
			}
			return
		}
	}
	t.Fatalf("release %s não encontrada", version)
}

// Release obrigatória e nota em destaque voltam do banco (ADR 0066); repetir o
// deploy sem a marca desliga a obrigatória.
func TestRepositoryKeepsRequiredAndHighlight(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	repo := NewRepository(db)
	version := fmt.Sprintf("8.%d.0", time.Now().UnixNano())
	p := Publication{Required: true, Entries: []Entry{
		{Kind: KindFeature, Text: "A", Source: "a.md", Highlight: true},
		{Kind: KindFix, Text: "B", Source: "b.md"},
	}}
	if err := repo.Upsert(ctx, version, p); err != nil {
		t.Fatal(err)
	}
	got := findRelease(t, repo, version)
	if !got.Required || !got.Entries[0].Highlight || got.Entries[1].Highlight {
		t.Fatalf("release lida: %+v", got)
	}
	p.Required = false
	if err := repo.Upsert(ctx, version, p); err != nil {
		t.Fatal(err)
	}
	if findRelease(t, repo, version).Required {
		t.Fatal("republicar sem a marca deveria desligar a obrigatória")
	}
}

func findRelease(t *testing.T, repo *Repository, version string) Release {
	t.Helper()
	releases, err := repo.List(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range releases {
		if r.Version == version {
			return r
		}
	}
	t.Fatalf("release %s não encontrada", version)
	return Release{}
}
