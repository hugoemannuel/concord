package deviceobs

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	deviceMigration = "000213_device_metrics.up.sql"
	userAna         = "6f1c1b7e-8a5e-4a51-9f2a-000000000001"
	userBia         = "6f1c1b7e-8a5e-4a51-9f2a-000000000002"
)

// newTestDB: só a migration deste pacote, num schema descartável do Postgres
// de TEST_DATABASE_URL (sem rodar as migrations todas). `users` e
// `dev_badge_users` são esboços, para as chaves estrangeiras e o IsDev; já
// vêm com a Ana e a Bia.
func newTestDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	schema := fmt.Sprintf("deviceobs_test_%d", time.Now().UnixNano())
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
	sql, err := os.ReadFile("../../migrations/" + deviceMigration)
	if err != nil {
		t.Fatal(err)
	}
	stmts := []string{
		"CREATE TABLE users (id UUID PRIMARY KEY, username TEXT NOT NULL DEFAULT 'x')",
		"CREATE TABLE dev_badge_users (user_id UUID PRIMARY KEY)",
		string(sql),
		fmt.Sprintf("INSERT INTO users (id, username) VALUES ('%s', 'ana'), ('%s', 'bia')", userAna, userBia),
	}
	for _, s := range stmts {
		if _, err := db.Exec(ctx, s); err != nil {
			t.Fatal(err)
		}
	}
	return db
}

func count(t *testing.T, db *pgxpool.Pool, sql string, args ...any) int {
	t.Helper()
	var n int
	if err := db.QueryRow(context.Background(), sql, args...).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
