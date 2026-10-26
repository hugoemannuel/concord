package permission_test

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/database"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/role"
	"gin-quickstart/backend/internal/server"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Estes testes rodam num Postgres de verdade (TEST_DATABASE_URL, banco
// descartável) e cobrem o que os fakes não pegam: a migration, o SQL dos
// repositórios e as cascatas.

func testDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	db, err := database.Connect(url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return db
}

func migrate(t *testing.T, db *pgxpool.Pool) {
	t.Helper()
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
}

func newUser(t *testing.T, db *pgxpool.Pool, ctx context.Context) string {
	t.Helper()
	id := uuid.NewString()
	name := "u" + id[:8]
	if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
	return id
}

type env struct {
	ctx         context.Context
	db          *pgxpool.Pool
	servers     *server.Repository
	serverSvc   *server.Service
	roleRepo    *role.Repository
	roleSvc     *role.Service
	channelSvc  *channel.Service
	permissions *permission.Service
	moderation  *server.Moderation
}

func newEnv(t *testing.T) *env {
	t.Helper()
	db := testDB(t)
	migrate(t, db)
	e := &env{ctx: context.Background(), db: db}
	e.servers = server.ServerRepository(db)
	e.roleRepo = role.RoleRepository(db)
	e.serverSvc = server.ServerService(e.servers, nil, e.roleRepo)
	e.permissions = permission.PermissionService(permission.PermissionRepository(db))
	e.roleSvc = role.RoleService(e.roleRepo, e.permissions, nil)
	e.channelSvc = channel.ChannelService(channel.ChannelRepository(db), nil)
	e.moderation = server.ModerationService(e.servers, e.permissions, nil)
	return e
}

// newServer cria um servidor com o dono e os cargos padrão.
func (e *env) newServer(t *testing.T, owner string) *server.Server {
	t.Helper()
	srv := &server.Server{Name: "s", OwnerID: owner}
	if err := e.serverSvc.Create(e.ctx, srv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { e.db.Exec(e.ctx, `DELETE FROM servers WHERE id = $1`, srv.ID) })
	return srv
}

func (e *env) join(t *testing.T, serverID, userID string) {
	t.Helper()
	if err := e.servers.AddingUserServer(e.ctx, &server.Server{ID: serverID}, &server.ServerMember{}, userID, "member"); err != nil {
		t.Fatal(err)
	}
}

func (e *env) roleByName(t *testing.T, serverID, name string) permission.Role {
	t.Helper()
	roles, err := e.roleRepo.List(e.ctx, serverID)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range roles {
		if r.Name == name {
			return r
		}
	}
	t.Fatalf("cargo %q não existe: %+v", name, roles)
	return permission.Role{}
}

func TestDBNewServerHasDefaultRoles(t *testing.T) {
	e := newEnv(t)
	owner := newUser(t, e.db, e.ctx)
	srv := e.newServer(t, owner)

	roles, err := e.roleRepo.List(e.ctx, srv.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(roles) != 3 {
		t.Fatalf("roles = %+v, want @everyone, Bots e Moderador", roles)
	}
	// Do mais alto para o mais baixo: Moderador (2), Bots (1), @everyone (0).
	mod, bots, everyone := roles[0], roles[1], roles[2]
	if mod.Name != permission.ModeratorName || mod.Position != 2 || mod.Permissions != permission.DefaultModerator || !mod.Hoist || mod.IsDefault || mod.IsSystem {
		t.Errorf("Moderador = %+v", mod)
	}
	if bots.Name != permission.BotsRoleName || bots.Position != 1 || bots.Permissions != 0 || !bots.Hoist || bots.IsDefault || !bots.IsSystem {
		t.Errorf("Bots = %+v", bots)
	}
	if everyone.Name != permission.EveryoneName || everyone.Position != 0 || everyone.Permissions != permission.DefaultEveryone || !everyone.IsDefault || everyone.IsSystem {
		t.Errorf("@everyone = %+v", everyone)
	}

	// Um @everyone por servidor.
	if _, err := e.db.Exec(e.ctx, `INSERT INTO roles (server_id, name, is_default) VALUES ($1, 'outro', TRUE)`, srv.ID); err == nil {
		t.Error("o índice único devia impedir dois @everyone")
	}
	// Um cargo de sistema (Bots) por servidor.
	if _, err := e.db.Exec(e.ctx, `INSERT INTO roles (server_id, name, is_system) VALUES ($1, 'outro_bot', TRUE)`, srv.ID); err == nil {
		t.Error("o índice único devia impedir dois cargos de sistema")
	}
}

func TestDBSnapshotMatchesPermissions(t *testing.T) {
	e := newEnv(t)
	owner, modUser, vipUser, plain := newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx)
	srv := e.newServer(t, owner)
	for _, u := range []string{modUser, vipUser, plain} {
		e.join(t, srv.ID, u)
	}
	mod := e.roleByName(t, srv.ID, permission.ModeratorName)
	if err := e.roleRepo.AddMemberRole(e.ctx, srv.ID, modUser, mod.ID); err != nil {
		t.Fatal(err)
	}
	vip := &permission.Role{ServerID: srv.ID, Name: "VIP"}
	if err := e.roleRepo.Create(e.ctx, vip); err != nil {
		t.Fatal(err)
	}
	if err := e.roleRepo.AddMemberRole(e.ctx, srv.ID, vipUser, vip.ID); err != nil {
		t.Fatal(err)
	}

	// Canal privado criado numa transação: o deny do @everyone nasce junto.
	snap, err := e.permissions.Snapshot(e.ctx, srv.ID)
	if err != nil {
		t.Fatal(err)
	}
	private := &channel.Channel{ServerID: srv.ID, Name: "vip-texto", Type: channel.TypeText, CreatedBy: owner}
	err = e.channelSvc.Create(e.ctx, private,
		permission.Overwrite{TargetType: permission.TargetRole, TargetID: snap.Everyone.ID, Deny: permission.ViewChannel},
		permission.Overwrite{TargetType: permission.TargetRole, TargetID: vip.ID, Allow: permission.ViewChannel},
	)
	if err != nil {
		t.Fatal(err)
	}
	public := &channel.Channel{ServerID: srv.ID, Name: "geral", Type: channel.TypeText, CreatedBy: owner}
	if err := e.channelSvc.Create(e.ctx, public); err != nil {
		t.Fatal(err)
	}

	snap, err = e.permissions.Snapshot(e.ctx, srv.ID)
	if err != nil {
		t.Fatal(err)
	}
	// 5 membros: dono + Maestro (adicionado na criação do servidor) + modUser + vipUser + plain.
	if snap.OwnerID != owner || len(snap.MemberRoles) < 4 || len(snap.Channels) != 2 {
		t.Fatalf("snapshot = owner %s, %d membros, %d canais", snap.OwnerID, len(snap.MemberRoles), len(snap.Channels))
	}
	if len(snap.Channels[private.ID].Overwrites) != 2 || len(snap.Channels[public.ID].Overwrites) != 0 {
		t.Fatalf("overwrites: %+v", snap.Channels)
	}

	visible := func(user string) []string {
		ids := []string{}
		for id := range snap.VisibleChannels(user) {
			ids = append(ids, id)
		}
		sort.Strings(ids)
		return ids
	}
	only := func(ids ...string) []string { sort.Strings(ids); return ids }
	if got := visible(plain); !reflect.DeepEqual(got, only(public.ID)) {
		t.Errorf("membro comum vê %v", got)
	}
	if got := visible(modUser); !reflect.DeepEqual(got, only(public.ID)) {
		t.Errorf("moderador não vê o privado: %v", got)
	}
	if got := visible(vipUser); !reflect.DeepEqual(got, only(public.ID, private.ID)) {
		t.Errorf("vip vê %v", got)
	}
	if got := visible(owner); !reflect.DeepEqual(got, only(public.ID, private.ID)) {
		t.Errorf("dono vê %v", got)
	}

	// O mesmo resultado pelo serviço, a partir do canal.
	perms, err := e.permissions.ChannelPerms(e.ctx, private.ID, plain)
	if err != nil || perms != 0 {
		t.Errorf("ChannelPerms(plain, privado) = %d, %v", perms, err)
	}
	if _, err := e.permissions.ChannelPerms(e.ctx, uuid.NewString(), plain); !errors.Is(err, permission.ErrChannelNotFound) {
		t.Errorf("canal inexistente: err = %v", err)
	}
}

func TestDBLegacyRoleAndRoleIDsInMemberList(t *testing.T) {
	e := newEnv(t)
	owner, modUser, plain := newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx)
	srv := e.newServer(t, owner)
	e.join(t, srv.ID, modUser)
	e.join(t, srv.ID, plain)
	mod := e.roleByName(t, srv.ID, permission.ModeratorName)
	if err := e.roleRepo.AddMemberRole(e.ctx, srv.ID, modUser, mod.ID); err != nil {
		t.Fatal(err)
	}

	members, err := e.serverSvc.ListMembers(e.ctx, srv.ID)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]server.ServerMember{}
	for _, m := range members {
		got[m.UserID] = m
	}
	if got[owner].Role != "admin" || got[modUser].Role != "admin" || got[plain].Role != "member" {
		t.Errorf("campo legado role: dono=%s mod=%s membro=%s", got[owner].Role, got[modUser].Role, got[plain].Role)
	}
	if !reflect.DeepEqual(got[modUser].RoleIDs, []string{mod.ID}) || len(got[plain].RoleIDs) != 0 || got[plain].RoleIDs == nil {
		t.Errorf("role_ids: mod=%v membro=%v (membro devia ser [] e não null)", got[modUser].RoleIDs, got[plain].RoleIDs)
	}

	one, err := e.servers.FindMemberByUserID(e.ctx, srv.ID, modUser)
	if err != nil || one.Role != "admin" || len(one.RoleIDs) != 1 {
		t.Errorf("FindMemberByUserID = %+v, %v", one, err)
	}

	// Dar MANAGE_CHANNELS ao @everyone faz todo mundo contar como "admin" no legado.
	if _, err := e.db.Exec(e.ctx, `UPDATE roles SET permissions = permissions | $2 WHERE server_id = $1 AND is_default`, srv.ID, permission.ManageChannels); err != nil {
		t.Fatal(err)
	}
	one, _ = e.servers.FindMemberByUserID(e.ctx, srv.ID, plain)
	if one.Role != "admin" {
		t.Errorf("com MANAGE_CHANNELS no @everyone o legado devia ser admin: %s", one.Role)
	}
}

func TestDBCascades(t *testing.T) {
	e := newEnv(t)
	owner, ana, bia := newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx)
	srv := e.newServer(t, owner)
	e.join(t, srv.ID, ana)
	e.join(t, srv.ID, bia)

	vip := &permission.Role{ServerID: srv.ID, Name: "VIP"}
	if err := e.roleRepo.Create(e.ctx, vip); err != nil {
		t.Fatal(err)
	}
	for _, u := range []string{ana, bia} {
		if err := e.roleRepo.AddMemberRole(e.ctx, srv.ID, u, vip.ID); err != nil {
			t.Fatal(err)
		}
	}
	ch := &channel.Channel{ServerID: srv.ID, Name: "geral", Type: channel.TypeText, CreatedBy: owner}
	if err := e.channelSvc.Create(e.ctx, ch,
		permission.Overwrite{TargetType: permission.TargetRole, TargetID: vip.ID, Allow: permission.SendMessages},
		permission.Overwrite{TargetType: permission.TargetMember, TargetID: ana, Deny: permission.SendMessages},
	); err != nil {
		t.Fatal(err)
	}
	count := func(sql string, args ...any) int {
		var n int
		if err := e.db.QueryRow(e.ctx, sql, args...).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}

	// Expulsar a ana apaga os cargos dela, não os da bia.
	if err := e.servers.RemoveMember(e.ctx, srv.ID, ana); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM member_roles WHERE server_id = $1 AND user_id = $2`, srv.ID, ana); n != 0 {
		t.Errorf("member_roles da ana = %d, want 0", n)
	}
	if n := count(`SELECT COUNT(*) FROM member_roles WHERE server_id = $1 AND user_id = $2`, srv.ID, bia); n != 1 {
		t.Errorf("member_roles da bia = %d, want 1", n)
	}

	// Apagar o cargo tira ele da bia e a sobrescrita do canal.
	if err := e.roleRepo.Delete(e.ctx, srv.ID, vip.ID); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM member_roles WHERE role_id = $1`, vip.ID); n != 0 {
		t.Errorf("member_roles do cargo = %d, want 0", n)
	}
	if n := count(`SELECT COUNT(*) FROM channel_overwrites WHERE channel_id = $1 AND target_type = 'role'`, ch.ID); n != 0 {
		t.Errorf("sobrescrita do cargo apagado = %d, want 0", n)
	}
	if n := count(`SELECT COUNT(*) FROM channel_overwrites WHERE channel_id = $1`, ch.ID); n != 1 {
		t.Errorf("a sobrescrita de membro continua: %d", n)
	}
	// O @everyone e o Bots não se apagam.
	everyone := e.roleByName(t, srv.ID, permission.EveryoneName)
	if err := e.roleRepo.Delete(e.ctx, srv.ID, everyone.ID); !errors.Is(err, role.ErrRoleNotFound) {
		t.Errorf("apagar @everyone: err = %v", err)
	}
	bots := e.roleByName(t, srv.ID, permission.BotsRoleName)
	if err := e.roleRepo.Delete(e.ctx, srv.ID, bots.ID); !errors.Is(err, role.ErrRoleNotFound) {
		t.Errorf("apagar Bots: err = %v", err)
	}

	// Apagar o canal apaga as sobrescritas; apagar o servidor leva tudo.
	if err := e.channelSvc.Delete(e.ctx, ch.ID); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM channel_overwrites WHERE channel_id = $1`, ch.ID); n != 0 {
		t.Errorf("sobrescritas do canal apagado = %d", n)
	}
	if err := e.serverSvc.Delete(e.ctx, srv.ID); err != nil {
		t.Fatal(err)
	}
	if n := count(`SELECT COUNT(*) FROM roles WHERE server_id = $1`, srv.ID); n != 0 {
		t.Errorf("cargos do servidor apagado = %d", n)
	}
}

func TestDBRoleCreateAndReorderPositions(t *testing.T) {
	e := newEnv(t)
	owner := newUser(t, e.db, e.ctx)
	srv := e.newServer(t, owner)

	a := &permission.Role{ServerID: srv.ID, Name: "A"}
	b := &permission.Role{ServerID: srv.ID, Name: "B"}
	for _, r := range []*permission.Role{a, b} {
		if err := e.roleRepo.Create(e.ctx, r); err != nil {
			t.Fatal(err)
		}
	}
	names := func() []string {
		roles, err := e.roleRepo.List(e.ctx, srv.ID)
		if err != nil {
			t.Fatal(err)
		}
		out := []string{}
		for _, r := range roles {
			out = append(out, r.Name)
		}
		return out
	}
	// Cargo novo entra logo acima dos cargos fixos (Bots e @everyone), abaixo dos anteriores.
	if got := names(); !reflect.DeepEqual(got, []string{permission.ModeratorName, "A", "B", permission.BotsRoleName, permission.EveryoneName}) {
		t.Fatalf("ordem = %v", got)
	}

	roles, err := e.roleSvc.Reorder(e.ctx, srv.ID, owner, []string{b.ID, e.roleByName(t, srv.ID, permission.ModeratorName).ID, a.ID})
	if err != nil {
		t.Fatal(err)
	}
	got := []string{}
	for _, r := range roles {
		got = append(got, r.Name)
	}
	if want := []string{"B", permission.ModeratorName, "A", permission.BotsRoleName, permission.EveryoneName}; !reflect.DeepEqual(got, want) {
		t.Fatalf("depois de reordenar = %v, want %v", got, want)
	}

	// Pelo serviço de verdade: o dono dá cargo e o snapshot reflete.
	member := newUser(t, e.db, e.ctx)
	e.join(t, srv.ID, member)
	ids, err := e.roleSvc.SetMemberRole(e.ctx, srv.ID, owner, member, a.ID, true)
	if err != nil || !reflect.DeepEqual(ids, []string{a.ID}) {
		t.Fatalf("SetMemberRole = %v, %v", ids, err)
	}
	if _, err := e.roleSvc.SetModerator(e.ctx, srv.ID, owner, member, true); err != nil {
		t.Fatal(err)
	}
	snap, _ := e.permissions.Snapshot(e.ctx, srv.ID)
	if !permission.Has(snap.Server(member), permission.ManageChannels) {
		t.Error("virar moderador devia dar MANAGE_CHANNELS")
	}
}

func TestDBBanFlow(t *testing.T) {
	e := newEnv(t)
	owner, mod, victim := newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx)
	srv := e.newServer(t, owner)
	e.join(t, srv.ID, mod)
	e.join(t, srv.ID, victim)
	modRole := e.roleByName(t, srv.ID, permission.ModeratorName)
	if err := e.roleRepo.AddMemberRole(e.ctx, srv.ID, mod, modRole.ID); err != nil {
		t.Fatal(err)
	}
	code, err := e.serverSvc.InviteCode(e.ctx, srv.ID, owner)
	if err != nil {
		t.Fatal(err)
	}

	// Moderador padrão não bane; o dono bane.
	if err := e.moderation.Ban(e.ctx, srv.ID, mod, victim, "spam"); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("moderador banindo: err = %v", err)
	}
	if err := e.moderation.Ban(e.ctx, srv.ID, owner, victim, "spam"); err != nil {
		t.Fatal(err)
	}
	if ok, _ := e.servers.IsMember(e.ctx, srv.ID, victim); ok {
		t.Fatal("banido continua membro")
	}
	if banned, _ := e.servers.IsBanned(e.ctx, srv.ID, victim); !banned {
		t.Fatal("ban não foi gravado")
	}

	// Não volta por código nem por convite.
	if _, err := e.serverSvc.JoinByCode(e.ctx, code, victim); !errors.Is(err, server.ErrBanned) {
		t.Fatalf("JoinByCode: err = %v, want ErrBanned", err)
	}
	if err := e.serverSvc.InviteUser(e.ctx, srv.ID, owner, victim); !errors.Is(err, server.ErrBanned) {
		t.Fatalf("InviteUser: err = %v, want ErrBanned", err)
	}

	bans, err := e.moderation.ListBans(e.ctx, srv.ID, owner)
	if err != nil || len(bans) != 1 || bans[0].UserID != victim || bans[0].Reason == nil || *bans[0].Reason != "spam" {
		t.Fatalf("bans = %+v, %v", bans, err)
	}

	// Desbanir libera a entrada.
	if err := e.moderation.Unban(e.ctx, srv.ID, owner, victim); err != nil {
		t.Fatal(err)
	}
	if _, err := e.serverSvc.JoinByCode(e.ctx, code, victim); err != nil {
		t.Fatalf("depois do unban: %v", err)
	}

	// Expulsar pela hierarquia: o moderador padrão expulsa o membro, não o dono.
	if err := e.moderation.Kick(e.ctx, srv.ID, mod, victim); err != nil {
		t.Fatalf("kick: %v", err)
	}
	if err := e.moderation.Kick(e.ctx, srv.ID, mod, owner); !errors.Is(err, server.ErrCannotActOn) {
		t.Fatalf("expulsar o dono: err = %v", err)
	}
	if err := e.moderation.Leave(e.ctx, srv.ID, owner); !errors.Is(err, server.ErrOwnerCannotLeave) {
		t.Fatalf("dono saindo: err = %v", err)
	}
}

func TestDBOverwriteUpsertAndDelete(t *testing.T) {
	e := newEnv(t)
	owner := newUser(t, e.db, e.ctx)
	srv := e.newServer(t, owner)
	repo := channel.ChannelRepository(e.db)

	ch := &channel.Channel{ServerID: srv.ID, Name: "geral", Type: channel.TypeText, CreatedBy: owner}
	if err := e.channelSvc.Create(e.ctx, ch); err != nil {
		t.Fatal(err)
	}
	everyone := e.roleByName(t, srv.ID, permission.EveryoneName)

	o := permission.Overwrite{TargetType: permission.TargetRole, TargetID: everyone.ID, Deny: permission.SendMessages}
	if err := repo.SetOverwrite(e.ctx, ch.ID, o); err != nil {
		t.Fatal(err)
	}
	o.Deny, o.Allow = 0, permission.AddReactions
	if err := repo.SetOverwrite(e.ctx, ch.ID, o); err != nil { // upsert
		t.Fatal(err)
	}
	snap, _ := e.permissions.Snapshot(e.ctx, srv.ID)
	got := snap.Channels[ch.ID].Overwrites
	if len(got) != 1 || got[0].Allow != permission.AddReactions || got[0].Deny != 0 {
		t.Fatalf("overwrites = %+v", got)
	}
	if err := repo.DeleteOverwrite(e.ctx, ch.ID, permission.TargetRole, everyone.ID); err != nil {
		t.Fatal(err)
	}
	snap, _ = e.permissions.Snapshot(e.ctx, srv.ID)
	if len(snap.Channels[ch.ID].Overwrites) != 0 {
		t.Fatal("sobrescrita não foi apagada")
	}

	// target_type fora de role/member é recusado pelo banco.
	if err := repo.SetOverwrite(e.ctx, ch.ID, permission.Overwrite{TargetType: "grupo", TargetID: everyone.ID}); err == nil {
		t.Error("o CHECK de target_type devia recusar")
	}
}

// A migration tem que transformar os servidores que já existiam: cada um ganha
// @everyone, Bots e Moderador, e quem era role='admin' (fora o dono) vira Moderador.
//
// Atenção: este teste desfaz a 029 e a refaz, então só serve com banco
// descartável (como o resto) e não deve rodar ao mesmo tempo que outros testes
// de banco do mesmo schema (use go test -p 1 localmente).
func TestDBMigrationBackfillsExistingServers(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	// Banco só com as migrations anteriores à 029, como produção antes dela.
	// As posteriores (030, 031, ...) também ficam de fora: se entrassem, o
	// banco iria para a versão mais alta e o Migrate pularia a 029 depois. A
	// 039 (apelidos) e a 053 (Bots) mexem nos cargos: rodam depois, junto com a 029.
	dir := t.TempDir()
	entries, err := os.ReadDir("../../migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		version, err := strconv.Atoi(strings.SplitN(entry.Name(), "_", 2)[0])
		if err != nil {
			t.Fatalf("migration sem número: %s", entry.Name())
		}
		if version >= 29 {
			continue
		}
		raw, err := os.ReadFile(filepath.Join("../../migrations", entry.Name()))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, entry.Name()), raw, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.Exec(ctx, `DROP TABLE IF EXISTS server_bans, channel_overwrites, member_roles, roles CASCADE`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `ALTER TABLE server_members DROP COLUMN IF EXISTS nickname`); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `UPDATE schema_migrations SET version = 28`); err != nil {
		// Primeira execução neste banco: o Migrate cria a tabela.
		t.Log("schema_migrations ainda não existe:", err)
	}
	if err := database.Migrate(db, dir); err != nil {
		t.Fatal(err)
	}

	owner, admin, plain := newUser(t, db, ctx), newUser(t, db, ctx), newUser(t, db, ctx)
	serverID := uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO servers (id, name, icon_url, owner_id) VALUES ($1, 's', '', $2)`, serverID, owner); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID) })
	for user, roleName := range map[string]string{owner: "admin", admin: "admin", plain: "member"} {
		if _, err := db.Exec(ctx, `INSERT INTO server_members (server_id, user_id, role) VALUES ($1, $2, $3)`, serverID, user, roleName); err != nil {
			t.Fatal(err)
		}
	}

	// Agora aplica a 029 (e a 039, 053) em cima dos dados.
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}

	roles, err := role.RoleRepository(db).List(ctx, serverID)
	if err != nil || len(roles) != 3 {
		t.Fatalf("roles = %+v, %v", roles, err)
	}
	if roles[2].Permissions != permission.DefaultEveryone || !roles[2].IsDefault ||
		roles[1].Name != permission.BotsRoleName || !roles[1].IsSystem || !roles[1].Hoist ||
		roles[0].Permissions != permission.DefaultModerator || roles[0].Name != permission.ModeratorName {
		t.Errorf("cargos padrão errados: %+v", roles)
	}

	svc := permission.PermissionService(permission.PermissionRepository(db))
	snap, err := svc.Snapshot(ctx, serverID)
	if err != nil {
		t.Fatal(err)
	}
	if !permission.Has(snap.Server(admin), permission.ManageChannels|permission.MoveMembers) {
		t.Error("o antigo admin virou Moderador e mantém o que fazia")
	}
	if permission.Has(snap.Server(plain), permission.ManageChannels) {
		t.Error("membro comum não ganha poderes")
	}
	if len(snap.MemberRoles[owner]) != 0 {
		t.Errorf("o dono não precisa de cargo (já tem tudo): %v", snap.MemberRoles[owner])
	}
	if snap.Server(owner) != permission.All {
		t.Error("o dono continua com tudo")
	}
	// 000039: todo mundo pode mudar o próprio apelido; o Moderador, o dos outros.
	if !permission.Has(snap.Server(plain), permission.ChangeNickname) || permission.Has(snap.Server(plain), permission.ManageNicknames) {
		t.Error("membro comum muda só o próprio apelido")
	}
	if !permission.Has(snap.Server(admin), permission.ChangeNickname|permission.ManageNicknames) {
		t.Error("o Moderador muda apelidos")
	}
}

func TestDBNicknameRoundTrip(t *testing.T) {
	e := newEnv(t)
	owner, plain := newUser(t, e.db, e.ctx), newUser(t, e.db, e.ctx)
	srv := e.newServer(t, owner)
	e.join(t, srv.ID, plain)
	nicknames := server.NicknameService(e.servers, e.permissions, nil)

	nickOf := func(userID string) *string {
		t.Helper()
		members, err := e.serverSvc.ListMembers(e.ctx, srv.ID)
		if err != nil {
			t.Fatal(err)
		}
		for _, m := range members {
			if m.UserID == userID {
				return m.Nickname
			}
		}
		t.Fatalf("%s não está na lista", userID)
		return nil
	}

	if nickOf(plain) != nil {
		t.Fatal("começa sem apelido")
	}
	// 32 caracteres com acento e emoji cabem na coluna (conta caractere).
	long := strings.Repeat("é", 31) + "🎮"
	if _, err := nicknames.Set(e.ctx, srv.ID, plain, plain, "  "+long+"  "); err != nil {
		t.Fatal(err)
	}
	if got := nickOf(plain); got == nil || *got != long {
		t.Fatalf("apelido = %v", got)
	}
	if _, err := nicknames.Set(e.ctx, srv.ID, owner, plain, "Pelo dono"); err != nil {
		t.Fatal(err)
	}
	if got := nickOf(plain); got == nil || *got != "Pelo dono" {
		t.Fatalf("apelido = %v", got)
	}
	if _, err := nicknames.Set(e.ctx, srv.ID, plain, plain, ""); err != nil {
		t.Fatal(err)
	}
	if nickOf(plain) != nil {
		t.Fatal("vazio devia tirar o apelido")
	}
	// Membro comum não muda o do dono.
	if _, err := nicknames.Set(e.ctx, srv.ID, plain, owner, "x"); !errors.Is(err, permission.ErrMissingPermission) {
		t.Fatalf("err = %v", err)
	}
	// O nome de verdade não muda.
	var displayName string
	if err := e.db.QueryRow(e.ctx, `SELECT display_name FROM users WHERE id = $1`, plain).Scan(&displayName); err != nil || strings.HasPrefix(displayName, "Pelo") {
		t.Fatalf("display_name = %q, %v", displayName, err)
	}
}
