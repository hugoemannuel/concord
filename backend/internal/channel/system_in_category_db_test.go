package channel

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL): o canal de sistema criado numa
// categoria (os canais de alerta, ADR 0071) grava o tipo, fica travado e entra
// na categoria.
func TestCreateSystemInCategory(t *testing.T) {
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	owner, server, category := uuid.NewString(), uuid.NewString(), uuid.NewString()
	for _, sql := range []struct {
		q    string
		args []any
	}{
		{`INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, []any{owner, "s" + owner[:8], owner[:8] + "@teste.dev"}},
		{`INSERT INTO servers(id,name,owner_id) VALUES($1,'s',$2)`, []any{server, owner}},
		{`INSERT INTO channel_categories(id,server_id,name) VALUES($1,$2,'Monitoramento')`, []any{category, server}},
	} {
		if _, err := db.Exec(ctx, sql.q, sql.args...); err != nil {
			t.Fatalf("%s: %v", sql.q, err)
		}
	}
	t.Cleanup(func() {
		_, _ = db.Exec(ctx, `DELETE FROM servers WHERE id=$1`, server)
		_, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	})

	service := newService(ChannelRepository(db), nil)
	ch, err := service.CreateSystemInCategory(ctx, server, category, "alertas", "alert_infra", owner)
	if err != nil {
		t.Fatal(err)
	}
	found, err := ChannelRepository(db).FindSystemByKind(ctx, server, "alert_infra")
	if err != nil || found.ID != ch.ID || !found.IsSystem || found.Name != "alertas" {
		t.Fatalf("canal = %+v, %v", found, err)
	}
	var placed string
	if err := db.QueryRow(ctx, `SELECT category_id::text FROM channel_category_layout WHERE channel_id=$1`, ch.ID).Scan(&placed); err != nil || placed != category {
		t.Fatalf("categoria = %q, %v", placed, err)
	}
	if _, err := service.Update(ctx, ch.ID, UpdateInput{Name: "outro"}); err != ErrSystemChannel {
		t.Fatalf("editar canal de sistema = %v", err)
	}
}
