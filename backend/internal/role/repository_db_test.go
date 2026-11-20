package role

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Num Postgres de verdade (TEST_DATABASE_URL): apagar o cargo leva junto as regras
// dele nos canais e nas categorias, e o @everyone não se apaga.
func TestDeleteRemovesRulesOfTheRole(t *testing.T) {
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
	owner, server, channel, category, vip, everyone := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec(`INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, owner, "r"+owner[:8], owner[:8]+"@teste.dev")
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner) })
	exec(`INSERT INTO servers(id,name,owner_id) VALUES($1,'s',$2)`, server, owner)
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM servers WHERE id=$1`, server) })
	exec(`INSERT INTO roles(id,server_id,name,position,permissions,is_default) VALUES($1,$2,'vip',1,0,false)`, vip, server)
	exec(`INSERT INTO channels(id,server_id,name,type,position,created_by) VALUES($1,$2,'c','text',0,$3)`, channel, server, owner)
	exec(`INSERT INTO channel_categories(id,server_id,name) VALUES($1,$2,'cat')`, category, server)
	exec(`INSERT INTO channel_overwrites(channel_id,target_type,target_id,allow) VALUES($1,'role',$2,1)`, channel, vip)
	exec(`INSERT INTO category_overwrites(category_id,target_type,target_id,allow) VALUES($1,'role',$2,1)`, category, vip)
	exec(`INSERT INTO category_overwrites(category_id,target_type,target_id,deny) VALUES($1,'role',$2,1)`, category, everyone)

	repo := RoleRepository(db)
	if err := repo.Delete(ctx, server, vip); err != nil {
		t.Fatal(err)
	}
	var rows int
	if err := db.QueryRow(ctx, `SELECT (SELECT COUNT(*) FROM channel_overwrites WHERE target_id=$1) + (SELECT COUNT(*) FROM category_overwrites WHERE target_id=$1)`, vip).Scan(&rows); err != nil || rows != 0 {
		t.Fatalf("sobraram %d regras (%v)", rows, err)
	}
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM category_overwrites WHERE target_id=$1`, everyone).Scan(&rows); err != nil || rows != 1 {
		t.Fatalf("a regra de outro alvo sumiu: %d (%v)", rows, err)
	}
	if err := repo.Delete(ctx, server, vip); err == nil {
		t.Fatal("apagar de novo deveria dizer que não achou")
	}
}

// serverNoBanco abre o Postgres de teste (TEST_DATABASE_URL) com as migrations
// e cria um dono e um servidor só com os cargos fixos.
func serverNoBanco(t *testing.T) (repo *Repository, db *pgxpool.Pool, owner, server string) {
	t.Helper()
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
	owner, server = uuid.NewString(), uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO users(id,username,display_name,email,password_hash) VALUES($1,$2,$2,$3,'x')`, owner, "m"+owner[:8], owner[:8]+"@teste.dev"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, owner) })
	if _, err := db.Exec(ctx, `INSERT INTO servers(id,name,owner_id) VALUES($1,'s',$2)`, server, owner); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM servers WHERE id=$1`, server) })
	if _, err := db.Exec(ctx, `INSERT INTO server_members(server_id,user_id) VALUES($1,$2)`, server, owner); err != nil {
		t.Fatal(err)
	}
	repo = RoleRepository(db)
	if err := repo.CreateDefaults(ctx, server); err != nil {
		t.Fatal(err)
	}
	return repo, db, owner, server
}

// O "qualquer pessoa pode mencionar" é gravado ao criar e ao editar, e volta
// na lista e no snapshot de permissões (que é de onde o chat lê os cargos).
func TestMentionableIsStoredAndLoaded(t *testing.T) {
	repo, db, _, server := serverNoBanco(t)
	ctx := context.Background()
	aberto := &Role{ServerID: server, Name: "Suporte", Mentionable: true}
	fechado := &Role{ServerID: server, Name: "Equipe"}
	for _, r := range []*Role{aberto, fechado} {
		if err := repo.Create(ctx, r); err != nil {
			t.Fatal(err)
		}
	}
	if !aberto.Mentionable || fechado.Mentionable {
		t.Fatalf("ao criar: aberto = %v, fechado = %v", aberto.Mentionable, fechado.Mentionable)
	}
	fechado.Mentionable = true
	if err := repo.Update(ctx, fechado); err != nil || !fechado.Mentionable {
		t.Fatalf("ao editar: mentionable = %v, err = %v", fechado.Mentionable, err)
	}

	roles, err := repo.List(ctx, server)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]bool{}
	for _, r := range roles {
		got[r.Name] = r.Mentionable
	}
	if !got["Suporte"] || !got["Equipe"] || got[permission.EveryoneName] || got[permission.BotsRoleName] {
		t.Fatalf("lista: %v", got)
	}
	snap, err := permission.PermissionRepository(db).LoadSnapshot(ctx, server)
	if err != nil {
		t.Fatal(err)
	}
	if !snap.Roles[aberto.ID].Mentionable || snap.Everyone.Mentionable {
		t.Fatal("o snapshot de permissões não trouxe o mentionable")
	}
}

// Os cargos da pessoa vêm agrupados por servidor; sem cargo, o mapa vem vazio.
func TestRoleIDsByServer(t *testing.T) {
	repo, _, owner, server := serverNoBanco(t)
	ctx := context.Background()
	if got, err := repo.RoleIDsByServer(ctx, owner); err != nil || len(got) != 0 {
		t.Fatalf("sem cargo: got %v, err = %v", got, err)
	}
	vip := &Role{ServerID: server, Name: "VIP"}
	if err := repo.Create(ctx, vip); err != nil {
		t.Fatal(err)
	}
	if err := repo.AddMemberRole(ctx, server, owner, vip.ID); err != nil {
		t.Fatal(err)
	}
	got, err := repo.RoleIDsByServer(ctx, owner)
	if err != nil || len(got) != 1 || len(got[server]) != 1 || got[server][0] != vip.ID {
		t.Fatalf("com cargo: got %v, err = %v", got, err)
	}
}
