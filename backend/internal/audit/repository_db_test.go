package audit

import (
	"context"
	"os"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Testes num Postgres de verdade (TEST_DATABASE_URL, já migrado).
type auditDB struct {
	ctx  context.Context
	db   *pgxpool.Pool
	repo *Repository
}

func newAuditDB(t *testing.T) *auditDB {
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
	return &auditDB{ctx: context.Background(), db: db, repo: NewRepository(db)}
}

func (a *auditDB) user(t *testing.T, display string) string {
	t.Helper()
	id := uuid.NewString()
	name := "u" + id[:8]
	if _, err := a.db.Exec(a.ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $3, $2::text || '@ex.com', 'x')`, id, name, display); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = a.db.Exec(a.ctx, `DELETE FROM users WHERE id = $1`, id) })
	return id
}

func (a *auditDB) server(t *testing.T, owner string) string {
	t.Helper()
	id := uuid.NewString()
	if _, err := a.db.Exec(a.ctx, `INSERT INTO servers (id, name, owner_id) VALUES ($1, 'teste', $2)`, id, owner); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = a.db.Exec(a.ctx, `DELETE FROM servers WHERE id = $1`, id) })
	return id
}

func (a *auditDB) channel(t *testing.T, serverID, owner, name string) string {
	t.Helper()
	id := uuid.NewString()
	if _, err := a.db.Exec(a.ctx, `INSERT INTO channels (id, server_id, name, type, created_by) VALUES ($1, $2, $3, 'text', $4)`, id, serverID, name, owner); err != nil {
		t.Fatal(err)
	}
	return id
}

func TestRepositoryGravaELeComNomes(t *testing.T) {
	a := newAuditDB(t)
	ana, bia := a.user(t, "Ana"), a.user(t, "Bia")
	srv := a.server(t, ana)
	geral := a.channel(t, srv, ana, "geral")

	events := []Event{
		{ServerID: srv, ActorID: ana, Action: MemberKick, TargetType: TargetMember, TargetID: bia, Reason: "spam"},
		{ServerID: srv, ActorID: ana, Action: MessageDelete, TargetType: TargetMember, TargetID: bia, ChannelID: geral},
		{ServerID: srv, ActorID: ana, Action: ChannelUpdate, TargetType: TargetChannel, TargetID: geral,
			Changes: []Change{{Field: "name", Before: "papo", After: "geral"}}},
	}
	for _, e := range events {
		if err := a.repo.Insert(a.ctx, e); err != nil {
			t.Fatal(err)
		}
	}

	got, err := a.repo.List(a.ctx, srv, Filter{Limit: 10})
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 3 || got[0].Action != ChannelUpdate || got[2].Action != MemberKick {
		t.Fatalf("ordem errada (quer mais recente primeiro): %+v", got)
	}
	if got[0].TargetName != "geral" || len(got[0].Changes) != 1 || got[0].Changes[0].Before != "papo" {
		t.Fatalf("canal: nome %q mudanças %+v", got[0].TargetName, got[0].Changes)
	}
	if got[1].ChannelName != "geral" || got[1].TargetName != "Bia" {
		t.Fatalf("mensagem: canal %q alvo %q", got[1].ChannelName, got[1].TargetName)
	}
	if got[2].ActorName != "Ana" || got[2].ActorID != ana || got[2].Reason != "spam" || got[2].Changes == nil {
		t.Fatalf("expulsão: %+v", got[2])
	}

	// O nome de membro é o atual (trocou o nome de exibição depois).
	if _, err := a.db.Exec(a.ctx, `UPDATE users SET display_name = 'Beatriz' WHERE id = $1`, bia); err != nil {
		t.Fatal(err)
	}
	got, _ = a.repo.List(a.ctx, srv, Filter{Action: MemberKick, Limit: 10})
	if len(got) != 1 || got[0].TargetName != "Beatriz" {
		t.Fatalf("filtro por ação / nome atual: %+v", got)
	}
}

func TestRepositoryFiltrosECursor(t *testing.T) {
	a := newAuditDB(t)
	ana, bia := a.user(t, "Ana"), a.user(t, "Bia")
	srv := a.server(t, ana)
	for i := 0; i < 3; i++ {
		_ = a.repo.Insert(a.ctx, Event{ServerID: srv, ActorID: ana, Action: RoleCreate, TargetType: TargetRole, TargetName: "c"})
	}
	_ = a.repo.Insert(a.ctx, Event{ServerID: srv, ActorID: bia, Action: RoleDelete, TargetType: TargetRole, TargetName: "c"})

	byBia, _ := a.repo.List(a.ctx, srv, Filter{ActorID: bia, Limit: 10})
	if len(byBia) != 1 || byBia[0].ActorID != bia {
		t.Fatalf("filtro por autor: %+v", byBia)
	}
	first, _ := a.repo.List(a.ctx, srv, Filter{Limit: 2})
	rest, _ := a.repo.List(a.ctx, srv, Filter{Before: first[1].ID, Limit: 10})
	if len(first) != 2 || len(rest) != 2 || rest[0].ID >= first[1].ID {
		t.Fatalf("cursor: primeira %+v resto %+v", first, rest)
	}
}

// Um servidor nunca vê o registro do outro.
func TestRepositoryIsolaServidores(t *testing.T) {
	a := newAuditDB(t)
	ana := a.user(t, "Ana")
	s1, s2 := a.server(t, ana), a.server(t, ana)
	_ = a.repo.Insert(a.ctx, Event{ServerID: s1, ActorID: ana, Action: ServerUpdate, TargetType: TargetServer, TargetID: s1})
	_ = a.repo.Insert(a.ctx, Event{ServerID: s2, ActorID: ana, Action: ServerUpdate, TargetType: TargetServer, TargetID: s2})
	for _, srv := range []string{s1, s2} {
		got, err := a.repo.List(a.ctx, srv, Filter{Limit: 10})
		if err != nil || len(got) != 1 || got[0].TargetID != srv {
			t.Fatalf("servidor %s vê %+v (err %v)", srv, got, err)
		}
	}
}

func TestRepositoryPrune(t *testing.T) {
	a := newAuditDB(t)
	ana := a.user(t, "Ana")
	srv := a.server(t, ana)
	_ = a.repo.Insert(a.ctx, Event{ServerID: srv, ActorID: ana, Action: RoleCreate, TargetName: "velho"})
	_ = a.repo.Insert(a.ctx, Event{ServerID: srv, ActorID: ana, Action: RoleCreate, TargetName: "novo"})
	if _, err := a.db.Exec(a.ctx, `UPDATE server_audit_log SET created_at = NOW() - INTERVAL '100 days' WHERE server_id = $1 AND target_name = 'velho'`, srv); err != nil {
		t.Fatal(err)
	}
	if err := a.repo.Prune(a.ctx, time.Now().AddDate(0, 0, -90)); err != nil {
		t.Fatal(err)
	}
	got, _ := a.repo.List(a.ctx, srv, Filter{Limit: 10})
	if len(got) != 1 || got[0].TargetName != "novo" {
		t.Fatalf("depois da retenção: %+v", got)
	}
}
