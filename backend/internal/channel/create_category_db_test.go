package channel

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL): canal novo nasce com as regras da
// categoria, e canal solto entra no fim de uma lista só, de texto e voz juntos.
func TestCreateInCategoryInheritsRules(t *testing.T) {
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
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	owner, server, category, everyone := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, owner, "c"+owner[:8], owner[:8]+"@teste.dev")
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner) })
	exec(`INSERT INTO servers(id,name,owner_id) VALUES($1,'s',$2)`, server, owner)
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM servers WHERE id=$1`, server) })
	exec(`INSERT INTO channel_categories(id,server_id,name) VALUES($1,$2,'privada')`, category, server)
	exec(`INSERT INTO category_overwrites(category_id,target_type,target_id,deny) VALUES($1,'role',$2,1)`, category, everyone)

	service := newService(ChannelRepository(db), nil)
	create := func(name, kind string, categoryID *string, overwrites ...permission.Overwrite) *Channel {
		t.Helper()
		ch := &Channel{ServerID: server, Name: name, Type: kind, CreatedBy: owner, CategoryID: categoryID}
		if err := service.Create(ctx, ch, overwrites...); err != nil {
			t.Fatal(err)
		}
		return ch
	}
	countRules := func(id string) int {
		t.Helper()
		var rows int
		if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM channel_overwrites WHERE channel_id=$1`, id).Scan(&rows); err != nil {
			t.Fatal(err)
		}
		return rows
	}

	inherited := create("herda", TypeVoice, &category)
	if countRules(inherited.ID) != 1 || len(inherited.Overwrites) != 1 || inherited.Overwrites[0].Deny != permission.ViewChannel || inherited.Overwrites[0].ChannelID != inherited.ID {
		t.Fatalf("regras herdadas: %+v", inherited.Overwrites)
	}
	own := create("proprio", TypeText, &category, permission.Overwrite{TargetType: permission.TargetRole, TargetID: everyone, Deny: permission.SendMessages})
	if countRules(own.ID) != 1 || own.Overwrites[0].Deny != permission.SendMessages {
		t.Fatalf("regras próprias: %+v", own.Overwrites)
	}
	missing := uuid.NewString()
	if err := service.Create(ctx, &Channel{ServerID: server, Name: "x", Type: TypeText, CreatedBy: owner, CategoryID: &missing}); err == nil {
		t.Fatal("criou em categoria que não existe")
	}

	first, second := create("a", TypeText, nil), create("b", TypeVoice, nil)
	position := func(id string) int {
		t.Helper()
		var at int
		if err := db.QueryRow(ctx, `SELECT position FROM channel_category_layout WHERE channel_id=$1 AND category_id IS NULL`, id).Scan(&at); err != nil {
			t.Fatal(err)
		}
		return at
	}
	if position(second.ID) != position(first.ID)+1 {
		t.Fatalf("posições: %d e %d", position(first.ID), position(second.ID))
	}
}
