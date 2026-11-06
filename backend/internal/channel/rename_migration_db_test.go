package channel

import (
	"context"
	"os"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
)

// Migration 000116 num Postgres de verdade (TEST_DATABASE_URL, banco descartável):
// só o canal de sistema do Maestro muda de nome; canal comum "bot" não é tocado.
func TestMigrationRenamesOnlyTheSystemBotChannel(t *testing.T) {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	db, err := database.Connect(dbURL)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	up := readFile(t, "../../migrations/000116_rename_bot_channel_to_musica.up.sql")
	down := readFile(t, "../../migrations/000116_rename_bot_channel_to_musica.down.sql")

	owner := uuid.NewString()
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}
	exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`,
		owner, "own"+uuid.NewString()[:8])
	var servers []string
	t.Cleanup(func() {
		for _, s := range servers {
			db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, s)
		}
		db.Exec(ctx, `DELETE FROM users WHERE id = $1`, owner)
	})
	newServer := func() string {
		id := uuid.NewString()
		servers = append(servers, id)
		exec(`INSERT INTO servers (id, name, icon_url, owner_id) VALUES ($1, 's', '', $2)`, id, owner)
		return id
	}
	addChannel := func(serverID, name, typ string, system bool) string {
		id := uuid.NewString()
		exec(`INSERT INTO channels (id, server_id, name, type, created_by, position, is_system) VALUES ($1, $2, $3, $4, $5, 0, $6)`,
			id, serverID, name, typ, owner, system)
		return id
	}

	simples, legado := newServer(), newServer()
	comVoz, comTexto := newServer(), newServer()
	comum := newServer()
	idSimples := addChannel(simples, "bot", "text", true)
	idLegado := addChannel(legado, "bot-maestro", "text", true)
	idComVoz := addChannel(comVoz, "bot", "text", true)
	addChannel(comVoz, "musica", "voice", false)
	idComTexto := addChannel(comTexto, "bot", "text", true)
	addChannel(comTexto, "musica", "text", false)
	idComumBot := addChannel(comum, "bot", "text", false)
	idAvisos := addChannel(comum, "avisos", "text", true)

	name := func(id string) string {
		t.Helper()
		var n string
		if err := db.QueryRow(ctx, `SELECT name FROM channels WHERE id = $1`, id).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	check := func(label string, want map[string]string) {
		t.Helper()
		for id, w := range want {
			if got := name(id); got != w {
				t.Errorf("%s: canal %s = %q, want %q", label, id, got, w)
			}
		}
	}

	exec(up)
	check("up", map[string]string{
		idSimples:  "musica",
		idLegado:   "musica",
		idComVoz:   "musica-maestro",
		idComTexto: "musica-maestro",
		idComumBot: "bot",
		idAvisos:   "avisos",
	})

	// O backfill do system_kind (000197) marca o canal do Maestro pelos dois
	// nomes; MaestroChannels acha pelo tipo e ignora o resto.
	exec(readFile(t, "../../migrations/000197_canal_de_sistema_tipo.up.sql"))
	found := map[string]bool{}
	list, err := ChannelRepository(db).MaestroChannels(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, ch := range list {
		found[ch.ID] = true
	}
	for id, want := range map[string]bool{
		idSimples: true, idLegado: true, idComVoz: true, idComTexto: true, idComumBot: false, idAvisos: false,
	} {
		if found[id] != want {
			t.Errorf("MaestroChannels inclui %s = %v, want %v", id, found[id], want)
		}
	}

	exec(down)
	check("down", map[string]string{
		idSimples:  "bot",
		idLegado:   "bot",
		idComVoz:   "bot",
		idComTexto: "bot",
		idComumBot: "bot",
		idAvisos:   "avisos",
	})
}

func readFile(t *testing.T, path string) string {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}
