package level

import (
	"context"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Várias pessoas numa escrita, com os totais de cada uma; quem não existe
// mais (conta apagada no meio da call) é pulado sem derrubar as outras.
func TestAddVoiceXPEmLoteDB(t *testing.T) {
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
	mk := func() string {
		id := uuid.NewString()
		name := "v" + strings.ReplaceAll(id, "-", "")[:12]
		if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, name); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = $1`, id) })
		return id
	}
	ana, bia := mk(), mk()
	repo := LevelRepository(db)

	totals, err := repo.AddVoiceXP(ctx, []voiceXP{{ana, 10, 60}, {bia, 20, 120}, {uuid.NewString(), 5, 60}})
	if err != nil {
		t.Fatal(err)
	}
	if len(totals) != 2 || totals[ana] != (voiceTotals{10, 60}) || totals[bia] != (voiceTotals{20, 120}) {
		t.Fatalf("totais = %+v", totals)
	}
	totals, err = repo.AddVoiceXP(ctx, []voiceXP{{ana, 10, 60}})
	if err != nil || totals[ana] != (voiceTotals{20, 120}) {
		t.Fatalf("segunda soma = %+v, %v", totals, err)
	}
	if totals, err := repo.AddVoiceXP(ctx, nil); err != nil || len(totals) != 0 {
		t.Fatalf("lote vazio = %+v, %v", totals, err)
	}
}
