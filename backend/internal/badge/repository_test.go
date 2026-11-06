package badge

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Contadores por trigger e gravação do tracker num Postgres de verdade
// (TEST_DATABASE_URL, banco descartável).
func TestRepositoryDB(t *testing.T) {
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
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatal(err)
		}
	}

	userID, serverID, channelID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	name := "b" + strings.ReplaceAll(userID, "-", "")[:12]
	exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, userID, name)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, serverID)
		db.Exec(ctx, `DELETE FROM messages WHERE author_id = $1`, userID)
		db.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	})
	exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, 'b', $2)`, serverID, userID)
	exec(`INSERT INTO channels (id, server_id, name, created_by) VALUES ($1, $2, 'geral', $3)`, channelID, serverID, userID)

	msgs := []string{uuid.NewString(), uuid.NewString(), uuid.NewString()}
	for i, id := range msgs {
		exec(`INSERT INTO messages (id, author_id, channel_id, content, created_at) VALUES ($1, $2, $3, $4, NOW() - INTERVAL '10 minutes')`, id, userID, channelID, fmt.Sprintf("oi %d", i))
	}
	// Mensagem de sistema não conta.
	exec(`INSERT INTO messages (id, author_id, channel_id, content, system_kind) VALUES ($1, $2, $3, 'parabéns', 'birthday')`, uuid.NewString(), userID, channelID)
	// Apagar depois de 2 minutos não desconta (mensagens_test.go).
	exec(`DELETE FROM messages WHERE id = $1`, msgs[2])

	exec(`INSERT INTO message_reactions (message_id, user_id, emoji) VALUES ($1, $2, '👍'), ($1, $2, '🔥'), ($3, $2, '👍')`, msgs[0], userID, msgs[1])
	exec(`DELETE FROM message_reactions WHERE message_id = $1 AND emoji = '🔥'`, msgs[0])

	repo := BadgeRepository(db)
	if err := repo.AddCallStats(ctx, map[string]Delta{userID: {Stream: 30, Watch: 20, Night: 10, PeakCallSize: 6, LongestSession: 100}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.AddCallStats(ctx, map[string]Delta{userID: {Stream: 30, Watch: 20, Morning: 5, PeakCallSize: 4, LongestSession: 50}}); err != nil {
		t.Fatal(err)
	}

	s, err := repo.Stats(ctx, userID)
	if err != nil {
		t.Fatal(err)
	}
	// Servidor sem membros além do dono não conta (dono_test.go).
	if s.MessagesSent != 3 || s.Reactions != 2 || s.OwnedServers != 0 {
		t.Fatalf("counters = msgs %d reactions %d servers %d, want 3/2/0", s.MessagesSent, s.Reactions, s.OwnedServers)
	}
	if s.StreamSeconds != 60 || s.WatchSeconds != 40 || s.NightSeconds != 10 || s.MorningSeconds != 5 || s.PeakCallSize != 6 || s.LongestSessionSeconds != 100 {
		t.Fatalf("call stats = %+v", s)
	}
	if s.IsDev {
		t.Fatal("new user is a dev before the grant")
	}

	// O SQL de docs/HOSPEDAGEM.md: concede pelo username (sem diferenciar
	// maiúsculas), e rodar de novo não duplica.
	grant := `INSERT INTO dev_badge_users (user_id) SELECT id FROM users WHERE lower(username) IN (lower($1)) ON CONFLICT DO NOTHING`
	exec(grant, strings.ToUpper(name))
	exec(grant, name)
	if s, err = repo.Stats(ctx, userID); err != nil || !s.IsDev {
		t.Fatalf("after grant IsDev = %v, %v", s.IsDev, err)
	}
	var grants int
	if err := db.QueryRow(ctx, `SELECT COUNT(*) FROM dev_badge_users WHERE user_id = $1`, userID).Scan(&grants); err != nil || grants != 1 {
		t.Fatalf("grants = %d, %v", grants, err)
	}
	exec(`DELETE FROM dev_badge_users WHERE user_id IN (SELECT id FROM users WHERE lower(username) IN (lower($1)))`, name)
	if s, err = repo.Stats(ctx, userID); err != nil || s.IsDev {
		t.Fatalf("after revoke IsDev = %v, %v", s.IsDev, err)
	}

	at := time.Now().Add(-time.Hour).UTC().Truncate(time.Microsecond)
	saved, err := repo.SaveUnlocks(ctx, userID, []Unlock{{"dono", 1, at}, {"fundador", 1, at}})
	if err != nil || len(saved) != 2 {
		t.Fatalf("first save = %+v, %v", saved, err)
	}
	saved, err = repo.SaveUnlocks(ctx, userID, []Unlock{{"dono", 1, time.Now()}, {"festeiro", 1, at}})
	if err != nil || len(saved) != 1 || saved[0].Category != "festeiro" {
		t.Fatalf("second save = %+v, %v (dono was already there)", saved, err)
	}
	unlocks, err := repo.Unlocks(ctx, userID)
	if err != nil {
		t.Fatal(err)
	}
	if got := unlocks["dono"][1]; !got.Equal(at) {
		t.Fatalf("dono unlocked_at = %v, want the first one %v", got, at)
	}

	// Maratona em andamento sobrevive ao deploy, uma vez só.
	if err := repo.SaveSessions(ctx, map[string]int64{userID: 7200}); err != nil {
		t.Fatal(err)
	}
	sessions, err := repo.LoadSessions(ctx, time.Minute)
	if err != nil || sessions[userID] != 7200 {
		t.Fatalf("sessions = %v, %v", sessions, err)
	}
	if again, _ := repo.LoadSessions(ctx, time.Minute); again[userID] != 0 {
		t.Fatalf("sessions read twice: %v", again)
	}
	if err := repo.SaveSessions(ctx, map[string]int64{userID: 60}); err != nil {
		t.Fatal(err)
	}
	exec(`UPDATE user_badge_stats SET session_saved_at = NOW() - INTERVAL '1 hour' WHERE user_id = $1`, userID)
	if old, _ := repo.LoadSessions(ctx, time.Minute); old[userID] != 0 {
		t.Fatalf("stale session resumed: %v", old)
	}

	if _, err := repo.Stats(ctx, uuid.NewString()); err != ErrUserNotFound {
		t.Fatalf("unknown user err = %v", err)
	}
}
