package plugin

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Testes num Postgres de verdade (TEST_DATABASE_URL, já migrado).
type pluginDB struct {
	ctx  context.Context
	db   *pgxpool.Pool
	repo *Repository
}

func newPluginDB(t *testing.T) *pluginDB {
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
	return &pluginDB{ctx: context.Background(), db: db, repo: NewRepository(db)}
}

func (p *pluginDB) user(t *testing.T) string {
	t.Helper()
	id := uuid.NewString()
	name := "u" + id[:8]
	if _, err := p.db.Exec(p.ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = p.db.Exec(p.ctx, `DELETE FROM users WHERE id = $1`, id) })
	return id
}

func (p *pluginDB) server(t *testing.T, owner string) string {
	t.Helper()
	id := uuid.NewString()
	if _, err := p.db.Exec(p.ctx, `INSERT INTO servers (id, name, owner_id) VALUES ($1, 'teste', $2)`, id, owner); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = p.db.Exec(p.ctx, `DELETE FROM servers WHERE id = $1`, id) })
	return id
}

func (p *pluginDB) member(t *testing.T, serverID, userID string) {
	t.Helper()
	if _, err := p.db.Exec(p.ctx, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, serverID, userID); err != nil {
		t.Fatal(err)
	}
}

func (p *pluginDB) plugin(t *testing.T, author, name string, approve bool) Plugin {
	t.Helper()
	pl, err := p.repo.Create(p.ctx, author, Draft{Name: name, Description: "desc", PanelURL: "https://ex.com/p"})
	if err != nil {
		t.Fatal(err)
	}
	if approve {
		if pl, err = p.repo.SetReview(p.ctx, pl.ID, StatusApproved, nil, author); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { _, _ = p.db.Exec(p.ctx, `DELETE FROM plugins WHERE id = $1`, pl.ID) })
	return pl
}

// cenário: dono A, membros B e C, servidor com um plugin aprovado instalado.
type scene struct {
	a, b, c, srv string
	pl           Plugin
}

func (p *pluginDB) scene(t *testing.T) scene {
	t.Helper()
	s := scene{a: p.user(t), b: p.user(t), c: p.user(t)}
	s.srv = p.server(t, s.a)
	for _, u := range []string{s.a, s.b, s.c} {
		p.member(t, s.srv, u)
	}
	s.pl = p.plugin(t, s.a, "Placar", true)
	if err := p.repo.Install(p.ctx, s.srv, s.pl.ID, s.a); err != nil {
		t.Fatal(err)
	}
	return s
}

func enabledOf(t *testing.T, p *pluginDB, srv, user string) (int, bool) {
	t.Helper()
	got, err := p.repo.ListServer(p.ctx, srv, user)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) == 0 {
		return 0, false
	}
	return len(got), got[0].Enabled
}

func findPlugin(list []Plugin, id string) *Plugin {
	for i := range list {
		if list[i].ID == id {
			return &list[i]
		}
	}
	return nil
}

func TestRepositoryCatalogShowsOnlyApproved(t *testing.T) {
	p := newPluginDB(t)
	a := p.user(t)
	ok := p.plugin(t, a, "Aprovado", true)
	pend := p.plugin(t, a, "Pendente", false)

	pub, err := p.repo.List(p.ctx, false)
	if err != nil {
		t.Fatal(err)
	}
	if findPlugin(pub, ok.ID) == nil || findPlugin(pub, pend.ID) != nil {
		t.Fatalf("catálogo público errado: %+v", pub)
	}
	all, err := p.repo.List(p.ctx, true)
	if err != nil {
		t.Fatal(err)
	}
	g := findPlugin(all, pend.ID)
	if findPlugin(all, ok.ID) == nil || g == nil || g.AuthorUsername == "" || g.Status != StatusPending {
		t.Fatalf("catálogo completo errado: %+v", g)
	}
}

func TestRepositoryEnableNeedsInstalledApproved(t *testing.T) {
	p := newPluginDB(t)
	a, b := p.user(t), p.user(t)
	srv := p.server(t, a)
	p.member(t, srv, a)
	p.member(t, srv, b)
	pl := p.plugin(t, a, "X", true)

	if err := p.repo.SetEnabled(p.ctx, srv, b, pl.ID, true); err != nil {
		t.Fatal(err)
	}
	if n, _ := enabledOf(t, p, srv, b); n != 0 {
		t.Fatal("sem instalar não deveria listar")
	}
	if err := p.repo.Install(p.ctx, srv, pl.ID, a); err != nil {
		t.Fatal(err)
	}
	if err := p.repo.Install(p.ctx, srv, pl.ID, a); err != nil {
		t.Fatalf("instalar de novo deve ser idempotente: %v", err)
	}
	if n, on := enabledOf(t, p, srv, b); n != 1 || on {
		t.Fatalf("ligar sem instalar não deve ter efeito: n=%d on=%v", n, on)
	}
	if err := p.repo.SetEnabled(p.ctx, srv, b, pl.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, on := enabledOf(t, p, srv, b); !on {
		t.Fatal("B deveria estar ligado")
	}
	if _, on := enabledOf(t, p, srv, a); on {
		t.Fatal("A não ligou")
	}
	if err := p.repo.SetEnabled(p.ctx, srv, b, pl.ID, false); err != nil {
		t.Fatal(err)
	}
	if _, on := enabledOf(t, p, srv, b); on {
		t.Fatal("B deveria estar desligado")
	}
}

func TestRepositoryUninstallClearsChoices(t *testing.T) {
	p := newPluginDB(t)
	s := p.scene(t)
	if err := p.repo.SetEnabled(p.ctx, s.srv, s.b, s.pl.ID, true); err != nil {
		t.Fatal(err)
	}
	if err := p.repo.Uninstall(p.ctx, s.srv, s.pl.ID); err != nil {
		t.Fatal(err)
	}
	if err := p.repo.Install(p.ctx, s.srv, s.pl.ID, s.a); err != nil {
		t.Fatal(err)
	}
	if n, on := enabledOf(t, p, s.srv, s.b); n != 1 || on {
		t.Fatalf("depois de reinstalar: n=%d on=%v", n, on)
	}
}

func TestRepositoryWithdrawHidesAndReapproveRestores(t *testing.T) {
	p := newPluginDB(t)
	s := p.scene(t)
	if err := p.repo.SetEnabled(p.ctx, s.srv, s.b, s.pl.ID, true); err != nil {
		t.Fatal(err)
	}
	note := "fora do padrão"
	if _, err := p.repo.SetReview(p.ctx, s.pl.ID, StatusRejected, &note, s.a); err != nil {
		t.Fatal(err)
	}
	if n, _ := enabledOf(t, p, s.srv, s.b); n != 0 {
		t.Fatal("rejeitado deveria sumir do servidor")
	}
	got, err := p.repo.SetReview(p.ctx, s.pl.ID, StatusApproved, nil, s.a)
	if err != nil || got.Status != StatusApproved {
		t.Fatalf("reaprovar: %+v %v", got, err)
	}
	if n, on := enabledOf(t, p, s.srv, s.b); n != 1 || !on {
		t.Fatalf("reaprovado deveria voltar ligado: n=%d on=%v", n, on)
	}
}

func TestRepositoryLeavingServerClearsChoices(t *testing.T) {
	p := newPluginDB(t)
	s := p.scene(t)
	if err := p.repo.SetEnabled(p.ctx, s.srv, s.b, s.pl.ID, true); err != nil {
		t.Fatal(err)
	}
	if _, err := p.db.Exec(p.ctx, `DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`, s.srv, s.b); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := p.db.QueryRow(p.ctx, `SELECT COUNT(*) FROM member_plugins WHERE user_id = $1`, s.b).Scan(&n); err != nil || n != 0 {
		t.Fatalf("sobraram %d linhas (err %v)", n, err)
	}
}

func TestRepositoryServersWith(t *testing.T) {
	p := newPluginDB(t)
	s := p.scene(t)
	srv2 := p.server(t, s.a)
	if err := p.repo.Install(p.ctx, srv2, s.pl.ID, s.a); err != nil {
		t.Fatal(err)
	}
	ids, err := p.repo.ServersWith(p.ctx, s.pl.ID)
	if err != nil || len(ids) != 2 {
		t.Fatalf("ids=%v err=%v", ids, err)
	}
}

func TestIconRoundTrip(t *testing.T) {
	p := newPluginDB(t)
	author := p.user(t)
	srv := p.server(t, author)
	p.member(t, srv, author)

	padrao := p.plugin(t, author, "Padrao", true)
	if padrao.Icon != IconPuzzle {
		t.Fatalf("icon padrão = %q", padrao.Icon)
	}
	bola, err := p.repo.Create(p.ctx, author, Draft{Name: "Bola", Description: "d", PanelURL: "https://ex.com/b", Icon: IconBall})
	if err != nil || bola.Icon != IconBall {
		t.Fatalf("create: %v %q", err, bola.Icon)
	}
	t.Cleanup(func() { _, _ = p.db.Exec(p.ctx, `DELETE FROM plugins WHERE id = $1`, bola.ID) })
	if bola, err = p.repo.SetReview(p.ctx, bola.ID, StatusApproved, nil, author); err != nil || bola.Icon != IconBall {
		t.Fatalf("review: %v %q", err, bola.Icon)
	}
	if err := p.repo.Install(p.ctx, srv, bola.ID, author); err != nil {
		t.Fatal(err)
	}
	got, err := p.repo.ListServer(p.ctx, srv, author)
	if err != nil || len(got) != 1 || got[0].Icon != IconBall {
		t.Fatalf("list server: %v %+v", err, got)
	}
	if one, err := p.repo.Get(p.ctx, bola.ID); err != nil || one.Icon != IconBall {
		t.Fatalf("get: %v %q", err, one.Icon)
	}
}
