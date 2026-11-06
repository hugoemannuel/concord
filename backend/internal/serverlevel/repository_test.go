package serverlevel

import (
	"context"
	"os"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Testes num Postgres de verdade (TEST_DATABASE_URL, banco descartável já
// migrado: este pacote não roda as migrations, para não disputar o lock com os
// outros pacotes).
func testDB(t *testing.T) (*pgxpool.Pool, context.Context) {
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
	var ok bool
	if err := db.QueryRow(ctx, `SELECT to_regclass('server_levels') IS NOT NULL`).Scan(&ok); err != nil || !ok {
		t.Skip("banco sem a migration 000150 (rode as migrations antes)")
	}
	return db, ctx
}

type world struct {
	t       *testing.T
	db      *pgxpool.Pool
	ctx     context.Context
	server  string
	channel string
	owner   string
}

func (w *world) exec(sql string, args ...any) {
	w.t.Helper()
	if _, err := w.db.Exec(w.ctx, sql, args...); err != nil {
		w.t.Fatalf("%s: %v", sql, err)
	}
}

// user cria uma pessoa; real = e-mail confirmado e conta de 30 dias (a outra
// tem 12 horas, abaixo das 24 h da conta real).
func (w *world) user(real bool) string {
	w.t.Helper()
	id := uuid.NewString()
	name := "sl" + strings.ReplaceAll(id, "-", "")[:12]
	// Conta real é a que confirmou o e-mail, mesmo recém-criada.
	w.exec(`INSERT INTO users (id, username, display_name, email, password_hash, email_verified_at)
		VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x', CASE WHEN $3 THEN NOW() END)`, id, name, real)
	w.t.Cleanup(func() {
		w.db.Exec(w.ctx, `DELETE FROM messages WHERE author_id = $1`, id)
		w.db.Exec(w.ctx, `DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

func newWorld(t *testing.T) *world {
	db, ctx := testDB(t)
	w := &world{t: t, db: db, ctx: ctx, server: uuid.NewString(), channel: uuid.NewString()}
	w.owner = w.user(true)
	w.exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, 'n', $2)`, w.server, w.owner)
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, w.server) })
	w.exec(`INSERT INTO channels (id, server_id, name, created_by) VALUES ($1, $2, 'geral', $3)`, w.channel, w.server, w.owner)
	return w
}

func (w *world) xp() int64 {
	w.t.Helper()
	xp, _, err := NewRepository(w.db).Detail(w.ctx, w.server)
	if err != nil {
		w.t.Fatal(err)
	}
	return xp
}

func (w *world) week() map[string]int64 {
	w.t.Helper()
	_, week, err := NewRepository(w.db).Detail(w.ctx, w.server)
	if err != nil {
		w.t.Fatal(err)
	}
	return week
}

func (w *world) message(author, content string) string {
	id := uuid.NewString()
	w.exec(`INSERT INTO messages (id, author_id, channel_id, content) VALUES ($1, $2, $3, $4)`, id, author, w.channel, content)
	return id
}

func TestRepositoryMensagensSeguemOAntiSpamDoBadge(t *testing.T) {
	w := newWorld(t)
	ana := w.user(true)

	w.message(ana, "oi")
	w.message(ana, "  OI ") // repetida em seguida: não conta
	w.message(ana, "tudo bem?")
	if got := w.xp(); got != 4 {
		t.Fatalf("xp = %d, quer 4 (2 mensagens que contam)", got)
	}

	// Apagada em até 2 minutos desconta.
	last := w.message(ana, "ops")
	w.exec(`DELETE FROM messages WHERE id = $1`, last)
	if got := w.xp(); got != 4 {
		t.Fatalf("xp = %d, quer 4 depois de apagar", got)
	}

	// Mensagem de sistema e de DM não contam.
	w.exec(`INSERT INTO messages (id, author_id, channel_id, content, system_kind) VALUES ($1, $2, $3, 'x', 'birthday')`, uuid.NewString(), ana, w.channel)
	if got := w.week()[SourceMessages]; got != 4 {
		t.Errorf("mensagens na semana = %d, quer 4", got)
	}
}

func TestRepositoryContaNaoRealEBotNaoContam(t *testing.T) {
	w := newWorld(t)
	nova := w.user(false)
	bot := w.user(true)
	w.exec(`UPDATE users SET is_bot = TRUE WHERE id = $1`, bot)

	w.message(nova, "oi")
	w.message(bot, "oi")
	if err := NewRepository(w.db).AddAll(w.ctx, []grant{{w.server, nova, SourceVoice, 10}}); err != nil {
		t.Fatal(err)
	}
	if got := w.xp(); got != 0 {
		t.Errorf("xp = %d, quer 0", got)
	}
}

func TestRepositoryTetoDiarioPorPessoaEPorFonte(t *testing.T) {
	w := newWorld(t)
	ana, bia := w.user(true), w.user(true)
	repo := NewRepository(w.db)
	// Ana duas vezes (dois flushes) e bia junto com ela no primeiro.
	if err := repo.AddAll(w.ctx, []grant{{w.server, ana, SourceVoice, 100}, {w.server, bia, SourceVoice, 30}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.AddAll(w.ctx, []grant{{w.server, ana, SourceVoice, 100}}); err != nil {
		t.Fatal(err)
	}
	if got := w.xp(); got != 150 {
		t.Errorf("xp = %d, quer 150 (ana no teto de 120 + bia 30)", got)
	}
	if got := w.week()[SourceVoice]; got != 150 {
		t.Errorf("voz na semana = %d, quer 150", got)
	}
}

// Servidor apagado no meio da call não derruba o lote dos outros; lote vazio
// não vai ao banco.
func TestRepositoryAddAllPulaServidorQueSumiu(t *testing.T) {
	w := newWorld(t)
	ana := w.user(true)
	repo := NewRepository(w.db)
	if err := repo.AddAll(w.ctx, []grant{{uuid.NewString(), ana, SourceVoice, 10}, {w.server, ana, SourceVoice, 20}}); err != nil {
		t.Fatal(err)
	}
	if err := repo.AddAll(w.ctx, nil); err != nil {
		t.Fatal(err)
	}
	if got := w.xp(); got != 20 {
		t.Errorf("xp = %d, quer 20", got)
	}
}

func TestRepositoryFigurinhaESomUmaVezPorItemEApagarLogoDesconta(t *testing.T) {
	w := newWorld(t)
	ana := w.user(true)
	sticker, sound := uuid.NewString(), uuid.NewString()
	w.exec(`INSERT INTO server_stickers (id, server_id, uploader_id, name, file_id, content_type, size_bytes) VALUES ($1, $2, $3, 'f', $1, 'image/png', 10)`, sticker, w.server, ana)
	w.exec(`INSERT INTO soundboard_sounds (id, server_id, uploader_id, name, content_type, size_bytes, duration_ms) VALUES ($1, $2, $3, 's', 'audio/ogg', 10, 1000)`, sound, w.server, ana)
	if got := w.xp(); got != 20 {
		t.Fatalf("xp = %d, quer 20", got)
	}
	w.exec(`DELETE FROM server_stickers WHERE id = $1`, sticker)
	if got := w.week(); got[SourceStickers] != 0 || got[SourceSounds] != 10 {
		t.Errorf("semana = %v, quer figurinha descontada e som mantido", got)
	}
}

func TestRepositoryMembroNovoUmaVezPorPessoa(t *testing.T) {
	w := newWorld(t)
	repo := NewRepository(w.db)
	ana, nova := w.user(true), w.user(false)
	w.exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $2), ($1, $3)`, w.server, ana, nova)
	if err := repo.GrantNewMembers(w.ctx); err != nil {
		t.Fatal(err)
	}
	if got := w.xp(); got != 50 {
		t.Fatalf("xp = %d, quer 50 (só a conta real)", got)
	}

	// Sair e voltar não dá de novo.
	w.exec(`DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`, w.server, ana)
	w.exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, w.server, ana)
	if err := repo.GrantNewMembers(w.ctx); err != nil {
		t.Fatal(err)
	}
	if got := w.xp(); got != 50 {
		t.Errorf("xp = %d, quer 50 depois de sair e voltar", got)
	}

	// Confirmou o e-mail depois: conta agora.
	w.exec(`UPDATE users SET email_verified_at = NOW() WHERE id = $1`, nova)
	if err := repo.GrantNewMembers(w.ctx); err != nil {
		t.Fatal(err)
	}
	if got := w.xp(); got != 100 {
		t.Errorf("xp = %d, quer 100", got)
	}
}

func TestRepositoryRecentESetLevel(t *testing.T) {
	w := newWorld(t)
	repo := NewRepository(w.db)
	ana := w.user(true)
	if err := repo.AddAll(w.ctx, []grant{{w.server, ana, SourceVoice, 60}}); err != nil {
		t.Fatal(err)
	}
	row := findRow(t, repo, w)
	if row.xp != 60 || row.level == nil || *row.level != 1 {
		t.Fatalf("linha = %+v, quer xp 60 e nível 1 (servidor novo nasce visto)", row)
	}
	if err := repo.SetLevel(w.ctx, w.server, 2); err != nil {
		t.Fatal(err)
	}
	if row := findRow(t, repo, w); *row.level != 2 {
		t.Errorf("nível = %d, quer 2", *row.level)
	}
}

func findRow(t *testing.T, repo *Repository, w *world) levelRow {
	t.Helper()
	rows, err := repo.Recent(w.ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rows {
		if r.serverID == w.server {
			return r
		}
	}
	t.Fatalf("servidor %s fora de Recent: %+v", w.server, rows)
	return levelRow{}
}
