package level

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Ordem, desempate e exclusões do ranking num Postgres de verdade
// (TEST_DATABASE_URL, banco descartável).
func TestRankingRepositoryDB(t *testing.T) {
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
	// Banco descartável: começa sem ninguém no ranking.
	db.Exec(ctx, `DELETE FROM user_levels`)

	mk := func(label string, xp int64, ago time.Duration, bot, active bool) string {
		id := uuid.NewString()
		name := label + strings.ReplaceAll(id, "-", "")[:10]
		if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash, is_bot, active) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x', $3, $4)`, id, name, bot, active); err != nil {
			t.Fatal(err)
		}
		if _, err := db.Exec(ctx, `INSERT INTO user_levels (user_id, xp, updated_at) VALUES ($1, $2, NOW() - $3::interval)`, id, xp, ago.String()); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
		return id
	}

	top := mk("top", 9000, time.Hour, false, true)
	empateAntigo := mk("antigo", 500, 2*time.Hour, false, true)
	empateNovo := mk("novo", 500, time.Hour, false, true)
	ultimo := mk("ult", 10, time.Hour, false, true)
	if _, err := db.Exec(ctx, `UPDATE users SET nameplate_mode = 'custom', nameplate_url = 'https://ex.com/faixa.png', avatar_decoration_url = 'https://ex.com/moldura.png' WHERE id = $1`, top); err != nil {
		t.Fatal(err)
	}
	mk("bot", 99999, time.Hour, true, true)
	mk("inativo", 99999, time.Hour, false, false)
	mk("zero", 0, time.Hour, false, true)

	repo := LevelRepository(db)
	got, err := repo.TopRanking(ctx, 100)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{top, empateAntigo, empateNovo, ultimo}
	if len(got) != len(want) {
		t.Fatalf("entradas = %d, quer %d (bot/inativo/zero ficam de fora): %+v", len(got), len(want), got)
	}
	for i, id := range want {
		if got[i].UserID != id {
			t.Errorf("posição %d = %s, quer %s", i+1, got[i].UserID, id)
		}
	}
	if got[0].NameStyle.Font != "default" || got[0].NameStyle.Effect != "solid" {
		t.Errorf("estilo do nome = %+v", got[0].NameStyle)
	}
	// Faixa e moldura vêm no SELECT; o scan tem de recebê-las (sem isso o
	// TopRanking falha e a tela do ranking mostra erro).
	if got[0].NameplateURL == nil || *got[0].NameplateURL != "https://ex.com/faixa.png" {
		t.Errorf("faixa = %v", got[0].NameplateURL)
	}
	if got[0].AvatarDecorationURL == nil || *got[0].AvatarDecorationURL != "https://ex.com/moldura.png" {
		t.Errorf("moldura = %v", got[0].AvatarDecorationURL)
	}
	if got[1].NameplateURL != nil || got[1].AvatarDecorationURL != nil {
		t.Errorf("sem faixa nem moldura, veio %+v", got[1].Look)
	}

	if top2, _ := repo.TopRanking(ctx, 2); len(top2) != 2 {
		t.Errorf("limite 2 devolveu %d", len(top2))
	}

	for id, pos := range map[string]int{top: 1, empateAntigo: 2, empateNovo: 3, ultimo: 4} {
		r, ok, err := repo.RankOf(ctx, id)
		if err != nil || !ok || r.Position != pos {
			t.Errorf("RankOf(%s) = %+v, %v, %v; quer posição %d", id, r, ok, err, pos)
		}
	}
	if _, ok, _ := repo.RankOf(ctx, uuid.NewString()); ok {
		t.Error("quem não tem XP não tem posição")
	}
}
