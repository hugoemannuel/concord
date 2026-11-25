package apperrors

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// newTestDB: só as migrations deste pacote, num schema descartável do
// Postgres de TEST_DATABASE_URL (sem rodar as migrations todas). `users` é um
// esboço com o id, para as chaves estrangeiras.
func newTestDB(t *testing.T, migrations ...string) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	schema := fmt.Sprintf("apperrors_test_%d", time.Now().UnixNano())
	admin, err := pgxpool.New(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(admin.Close)
	if _, err := admin.Exec(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = admin.Exec(ctx, "DROP SCHEMA "+schema+" CASCADE") })
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	db, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	stmts := []string{"CREATE TABLE users (id UUID PRIMARY KEY, username TEXT NOT NULL DEFAULT 'x')"}
	for _, m := range migrations {
		sql, err := os.ReadFile("../../migrations/" + m)
		if err != nil {
			t.Fatal(err)
		}
		stmts = append(stmts, string(sql))
	}
	for _, s := range stmts {
		if _, err := db.Exec(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

const migration = "000212_app_errors.up.sql"

// IDs das contas de teste (o esboço de users só tem id e username).
const (
	userAna = "11111111-1111-1111-1111-111111111111"
	userBia = "22222222-2222-2222-2222-222222222222"
)

var t0 = time.Date(2026, 11, 25, 12, 0, 0, 0, time.UTC)

func newTestRepo(t *testing.T) (*Repository, *pgxpool.Pool) {
	t.Helper()
	db := newTestDB(t, migration)
	ctx := context.Background()
	for id, name := range map[string]string{userAna: "ana", userBia: "bia"} {
		if _, err := db.Exec(ctx, "INSERT INTO users (id, username) VALUES ($1, $2)", id, name); err != nil {
			t.Fatal(err)
		}
	}
	return NewRepository(db), db
}

// captured: um erro já preparado (limpo e com a impressão digital).
func captured(source, kind, message string, count int) Captured {
	e := Captured{Source: source, Kind: kind, Message: message, Stack: "    at f (assets/x.js:1:2)", Screen: "/a", Count: count}
	prepare(&e)
	return e
}
