package server

import (
	"context"
	"errors"
	"os"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/audit/audittest"
	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Num Postgres de verdade (TEST_DATABASE_URL, já migrado): convite direto e
// apelido anterior lido do banco.
func TestAuditInviteAndNicknameDB(t *testing.T) {
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

	owner, friend, banned, serverID := uuid.NewString(), uuid.NewString(), uuid.NewString(), uuid.NewString()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{owner, friend, banned} {
		name := "u" + id[:8]
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name)
	}
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM users WHERE id IN ($1, $2, $3)`, owner, friend, banned)
	})
	exec(`INSERT INTO servers (id, name, icon_url, owner_id) VALUES ($1, 'Turma', '', $2)`, serverID, owner)
	exec(`INSERT INTO server_members (server_id, user_id, nickname) VALUES ($1, $2, 'Chefe')`, serverID, owner)
	exec(`INSERT INTO server_bans (server_id, user_id, banned_by) VALUES ($1, $2, $3)`, serverID, banned, owner)

	repo := ServerRepository(db)
	s := ServerService(repo, nil, nil)
	log := &audittest.Recorder{}
	s.SetAudit(log)

	if err := s.InviteUser(ctx, serverID, owner, banned); !errors.Is(err, ErrBanned) {
		t.Fatalf("convidar banido: err = %v", err)
	}
	if err := s.InviteUser(ctx, serverID, owner, friend); err != nil {
		t.Fatal(err)
	}
	want := []audit.Event{{ServerID: serverID, ActorID: owner, Action: audit.InviteCreate, TargetType: audit.TargetMember, TargetID: friend}}
	if got := log.Events(); !reflect.DeepEqual(got, want) {
		t.Fatalf("eventos:\n got %+v\nwant %+v", got, want)
	}

	nick, err := repo.MemberNickname(ctx, serverID, owner)
	if err != nil || nick == nil || *nick != "Chefe" {
		t.Fatalf("apelido = %v, %v", nick, err)
	}
}
