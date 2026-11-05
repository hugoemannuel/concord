package channelcategory

import (
	"context"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

const migrationSchema = `
CREATE TABLE servers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL);
CREATE TABLE channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    type VARCHAR(10) NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    managed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE channel_overwrites (
    channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    target_type VARCHAR(10) NOT NULL,
    target_id UUID NOT NULL,
    allow BIGINT NOT NULL DEFAULT 0,
    deny BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (channel_id, target_type, target_id)
);`

func readSQL(t *testing.T, name string) string {
	t.Helper()
	raw, err := os.ReadFile("../../migrations/" + name)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

type migrationDB struct {
	t    *testing.T
	conn *pgx.Conn
}

// oldFormatDB: um esquema só deste teste, com as tabelas como eram antes da 000194
// (a migration roda de verdade, sem depender do resto das migrations).
func oldFormatDB(t *testing.T) *migrationDB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL não definido")
	}
	ctx := context.Background()
	conn, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { conn.Close(ctx) })
	schema := "mig_" + strings.ReplaceAll(uuid.NewString(), "-", "")
	db := &migrationDB{t, conn}
	db.exec(fmt.Sprintf(`CREATE SCHEMA %s; SET search_path TO %s`, schema, schema))
	t.Cleanup(func() { _, _ = conn.Exec(ctx, `DROP SCHEMA `+schema+` CASCADE`) })
	db.exec(migrationSchema)
	db.exec(readSQL(t, "000187_channel_categories.up.sql"))
	return db
}

func (d *migrationDB) exec(sql string, args ...any) {
	d.t.Helper()
	if _, err := d.conn.Exec(context.Background(), sql, args...); err != nil {
		d.t.Fatalf("%s: %v", sql, err)
	}
}

func (d *migrationDB) up() { d.t.Helper(); d.exec(readSQL(d.t, "000194_categorias_normais.up.sql")) }
func (d *migrationDB) down() {
	d.t.Helper()
	d.exec(readSQL(d.t, "000194_categorias_normais.down.sql"))
}

func (d *migrationDB) server() string {
	d.t.Helper()
	id := uuid.NewString()
	d.exec(`INSERT INTO servers(id,name) VALUES($1,'s')`, id)
	return id
}

func (d *migrationDB) channel(server, name, kind string, position int, flags ...string) string {
	d.t.Helper()
	id := uuid.NewString()
	system := len(flags) > 0 && flags[0] == "system"
	managed := len(flags) > 0 && flags[0] == "managed"
	d.exec(`INSERT INTO channels(id,server_id,name,type,position,is_system,managed) VALUES($1,$2,$3,$4,$5,$6,$7)`, id, server, name, kind, position, system, managed)
	return id
}

func (d *migrationDB) category(server, name string, position int) string {
	d.t.Helper()
	id := uuid.NewString()
	d.exec(`INSERT INTO channel_categories(id,server_id,name,position) VALUES($1,$2,$3,$4)`, id, server, name, position)
	return id
}

func (d *migrationDB) place(server, channel string, category *string, position int) {
	d.t.Helper()
	d.exec(`INSERT INTO channel_category_layout(channel_id,server_id,category_id,position) VALUES($1,$2,$3,$4)`, channel, server, category, position)
}

// sidebar: a barra como o app a mostra: "categoria: canal canal ...", na ordem.
func (d *migrationDB) sidebar(server string) []string {
	d.t.Helper()
	ctx := context.Background()
	rows, err := d.conn.Query(ctx, `
 SELECT g.name, COALESCE(string_agg(c.name, ' ' ORDER BY l.position, c.created_at, c.name), '')
 FROM channel_categories g
 LEFT JOIN channel_category_layout l ON l.category_id = g.id
 LEFT JOIN channels c ON c.id = l.channel_id
 WHERE g.server_id = $1
 GROUP BY g.id, g.name, g.position ORDER BY g.position, g.id`, server)
	if err != nil {
		d.t.Fatal(err)
	}
	lines, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (string, error) {
		var name, channels string
		err := row.Scan(&name, &channels)
		return strings.TrimSpace(name + ": " + channels), err
	})
	if err != nil {
		d.t.Fatal(err)
	}
	return lines
}

func (d *migrationDB) looseCount(server string) int {
	d.t.Helper()
	var count int
	err := d.conn.QueryRow(context.Background(), `SELECT COUNT(*) FROM channels c LEFT JOIN channel_category_layout l ON l.channel_id=c.id WHERE c.server_id=$1 AND l.category_id IS NULL`, server).Scan(&count)
	if err != nil {
		d.t.Fatal(err)
	}
	return count
}

func wantSidebar(t *testing.T, got []string, want ...string) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("barra:\n%q\nesperado:\n%q", got, want)
	}
}

func TestMigrationOldServerWithoutCategories(t *testing.T) {
	db := oldFormatDB(t)
	server := db.server()
	// Na ordem da posição, não da criação; o de sistema entra como qualquer outro.
	db.channel(server, "geral", "text", 1)
	db.channel(server, "musica", "text", 2, "system")
	db.channel(server, "avisos", "text", 0, "system")
	db.channel(server, "sala", "voice", 1)
	db.channel(server, "evento", "voice", 0, "managed")
	// Sem categorias, o app ignora o que sobrou da organização.
	residual := db.channel(server, "resto", "text", 3)
	db.place(server, residual, nil, 0)
	db.up()
	wantSidebar(t, db.sidebar(server), "Canais de texto: avisos geral musica resto", "Canais de voz: evento sala")
	if count := db.looseCount(server); count != 0 {
		t.Fatalf("%d canais soltos", count)
	}
}

func TestMigrationServerWithoutChannelsGetsBoth(t *testing.T) {
	db := oldFormatDB(t)
	server := db.server()
	db.up()
	wantSidebar(t, db.sidebar(server), "Canais de texto:", "Canais de voz:")
}

func TestMigrationServerWithCategoriesKeepsScreen(t *testing.T) {
	db := oldFormatDB(t)
	server := db.server()
	teste := db.category(server, "teste", 0)
	sdafsd := db.category(server, "sdafsd", 1)
	a, b, c := db.channel(server, "a", "text", 0), db.channel(server, "b", "text", 1), db.channel(server, "c", "text", 2)
	v := db.channel(server, "v", "voice", 0)
	dentro := db.channel(server, "dentro", "voice", 1)
	// Com categorias, a posição da organização manda (e empate cai na do canal).
	db.place(server, c, nil, 0)
	db.place(server, a, nil, 1)
	db.place(server, b, nil, 1)
	db.place(server, dentro, &teste, 0)
	_, _ = v, sdafsd
	db.up()
	wantSidebar(t, db.sidebar(server), "Canais de texto: c a b", "Canais de voz: v", "teste: dentro", "sdafsd:")
}

func TestMigrationOnlyCreatesWhatIsNeeded(t *testing.T) {
	db := oldFormatDB(t)
	server := db.server()
	jogos := db.category(server, "jogos", 0)
	dentro := db.channel(server, "dentro", "text", 0)
	db.place(server, dentro, &jogos, 0)
	db.channel(server, "voz", "voice", 0)
	organizado := db.server()
	unica := db.category(organizado, "unica", 0)
	db.place(organizado, db.channel(organizado, "x", "text", 0), &unica, 0)
	db.up()
	wantSidebar(t, db.sidebar(server), "Canais de voz: voz", "jogos: dentro")
	wantSidebar(t, db.sidebar(organizado), "unica: x")
}

func TestMigrationReusesCategoryWithSameName(t *testing.T) {
	db := oldFormatDB(t)
	server := db.server()
	db.category(server, "jogos", 0)
	igual := db.category(server, "  canais DE texto ", 1)
	dentro := db.channel(server, "dentro", "text", 0)
	db.place(server, dentro, &igual, 0)
	db.channel(server, "solto", "text", 1)
	db.up()
	wantSidebar(t, db.sidebar(server), "canais DE texto : solto dentro", "jogos:")
}

func TestMigrationDownBringsChannelsBack(t *testing.T) {
	db := oldFormatDB(t)
	server := db.server()
	jogos := db.category(server, "jogos", 0)
	dentro := db.channel(server, "dentro", "text", 0)
	db.place(server, dentro, &jogos, 0)
	db.channel(server, "solto", "text", 1)
	db.channel(server, "voz", "voice", 0)
	db.up()
	db.down()
	wantSidebar(t, db.sidebar(server), "jogos: dentro")
	if count := db.looseCount(server); count != 2 {
		t.Fatalf("%d canais soltos", count)
	}
	db.up()
	wantSidebar(t, db.sidebar(server), "Canais de texto: solto", "Canais de voz: voz", "jogos: dentro")
}

func TestMigrationDownKeepsPrivateCategoryClosed(t *testing.T) {
	db := oldFormatDB(t)
	server := db.server()
	everyone := uuid.NewString()
	jogos := db.category(server, "jogos", 0)
	dentro := db.channel(server, "dentro", "text", 0)
	db.place(server, dentro, &jogos, 0)
	db.up()
	db.exec(`INSERT INTO category_overwrites(category_id,target_type,target_id,deny) VALUES($1,'role',$2,1)`, jogos, everyone)
	db.down()
	var deny int64
	err := db.conn.QueryRow(context.Background(), `SELECT deny FROM channel_overwrites WHERE channel_id=$1 AND target_id=$2`, dentro, everyone).Scan(&deny)
	if err != nil || deny&1 == 0 {
		t.Fatalf("deny %d, erro %v", deny, err)
	}
}
