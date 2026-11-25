package channelcategory

import (
	"testing"

	"github.com/google/uuid"
)

func TestFindByName(t *testing.T) {
	db, ctx := categoryTestDB(t)
	repo := NewRepository(db)
	owner, server := uuid.NewString(), uuid.NewString()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, []any{owner, "f" + owner[:8], owner[:8] + "@teste.dev"}},
		{`INSERT INTO servers(id,name,owner_id) VALUES($1,'s',$2)`, []any{server, owner}},
	} {
		if _, err := db.Exec(ctx, q.sql, q.args...); err != nil {
			t.Fatalf("%s: %v", q.sql, err)
		}
	}
	t.Cleanup(func() {
		_, _ = db.Exec(ctx, `DELETE FROM servers WHERE id=$1`, server)
		_, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner)
	})
	if id, err := repo.FindByName(ctx, server, "Monitoramento"); err != nil || id != "" {
		t.Fatalf("sem categoria: %q, %v", id, err)
	}
	created, err := repo.Create(ctx, server, "Monitoramento", nil)
	if err != nil {
		t.Fatal(err)
	}
	if id, err := repo.FindByName(ctx, server, "Monitoramento"); err != nil || id != created.ID {
		t.Fatalf("achou %q, quer %q (%v)", id, created.ID, err)
	}
	if id, _ := repo.FindByName(ctx, uuid.NewString(), "Monitoramento"); id != "" {
		t.Fatalf("achou em outro servidor: %q", id)
	}
}
