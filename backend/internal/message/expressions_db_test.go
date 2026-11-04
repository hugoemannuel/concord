package message

import (
	"context"
	"errors"
	"os"
	"sort"
	"testing"

	"gin-quickstart/backend/internal/expression"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/database"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Emojis e figurinhas de outros servidores num Postgres de verdade
// (TEST_DATABASE_URL, banco descartável): a regra, a marca de publicado e o que
// fica quando o item é apagado, com permissões e SQL reais.

type externalDB struct {
	ctx             context.Context
	db              *pgxpool.Pool
	service         *Service
	repo            *Repository
	perms           *permission.Service
	resolver        *expression.Resolver
	ana, bia        string
	origem, destino string
	canal, dm       string
	emoji, sticker  string
}

func newExternalDB(t *testing.T) *externalDB {
	t.Helper()
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
	exec := func(sql string, args ...any) {
		t.Helper()
		if _, err := db.Exec(ctx, sql, args...); err != nil {
			t.Fatalf("%s: %v", sql, err)
		}
	}

	e := &externalDB{
		ctx: ctx, db: db,
		ana: uuid.NewString(), bia: uuid.NewString(),
		origem: uuid.NewString(), destino: uuid.NewString(),
		canal: uuid.NewString(), dm: uuid.NewString(),
		emoji: uuid.NewString(), sticker: uuid.NewString(),
	}
	for _, id := range []string{e.ana, e.bia} {
		exec(`INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, "u"+id[:8])
	}
	// Ana está nos dois servidores; Bia só no de destino.
	exec(`INSERT INTO servers (id, name, owner_id) VALUES ($1, 'Origem', $2), ($3, 'Destino', $4)`, e.origem, e.ana, e.destino, e.bia)
	exec(`INSERT INTO server_members (server_id, user_id) VALUES ($1, $3), ($2, $3), ($2, $4)`, e.origem, e.destino, e.ana, e.bia)
	exec(`INSERT INTO roles (server_id, name, position, permissions, is_default) VALUES ($1, '@everyone', 0, $3, TRUE), ($2, '@everyone', 0, $3, TRUE) ON CONFLICT DO NOTHING`,
		e.origem, e.destino, permission.DefaultEveryone)
	exec(`UPDATE roles SET permissions = $2 WHERE server_id = $1 AND is_default`, e.destino, permission.DefaultEveryone)
	exec(`INSERT INTO channels (id, server_id, name, created_by) VALUES ($1, $2, 'geral', $3)`, e.canal, e.destino, e.bia)
	pair := []string{e.ana, e.bia}
	sort.Strings(pair)
	exec(`INSERT INTO conversations (id, user_a_id, user_b_id) VALUES ($1, $2, $3)`, e.dm, pair[0], pair[1])
	exec(`INSERT INTO server_emojis (id, server_id, uploader_id, name, content_type, size_bytes) VALUES ($1, $2, $3, 'festa', 'image/png', 10)`, e.emoji, e.origem, e.ana)
	exec(`INSERT INTO server_stickers (id, server_id, uploader_id, name, file_id, content_type, size_bytes) VALUES ($1, $2, $3, 'gato', $1, 'image/png', 10)`, e.sticker, e.origem, e.ana)
	t.Cleanup(func() {
		db.Exec(ctx, `DELETE FROM deleted_emojis WHERE id = $1`, e.emoji)
		db.Exec(ctx, `DELETE FROM messages WHERE channel_id = $1 OR conversation_id = $2`, e.canal, e.dm)
		db.Exec(ctx, `DELETE FROM conversations WHERE id = $1`, e.dm)
		db.Exec(ctx, `DELETE FROM servers WHERE id = ANY($1)`, []string{e.origem, e.destino})
		db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{e.ana, e.bia})
	})

	e.repo = MessageRepository(db)
	e.perms = permission.PermissionService(permission.PermissionRepository(db))
	e.service = MessageService(e.repo, &fakePublisher{}, e.perms, nil, nil, e.perms)
	store := expression.NewRepository(db)
	e.service.SetExpressionGuard(expression.NewGuard(store, e.perms))
	e.resolver = expression.NewResolver(store)
	return e
}

func (e *externalDB) token() string    { return "<:festa:" + e.emoji + ">" }
func (e *externalDB) reaction() string { return "<:" + e.emoji + ">" }

// tirarPermissao desliga USE_EXTERNAL_EMOJIS no @everyone do servidor de destino.
func (e *externalDB) tirarPermissao(t *testing.T) {
	t.Helper()
	if _, err := e.db.Exec(e.ctx, `UPDATE roles SET permissions = $2 WHERE server_id = $1 AND is_default`,
		e.destino, permission.DefaultEveryone&^permission.UseExternalEmojis); err != nil {
		t.Fatal(err)
	}
	e.perms.InvalidateServer(e.destino)
}

func (e *externalDB) publicado(t *testing.T, table, id string) bool {
	t.Helper()
	var published bool
	if err := e.db.QueryRow(e.ctx, `SELECT published_at IS NOT NULL FROM `+table+` WHERE id = $1`, id).Scan(&published); err != nil {
		t.Fatal(err)
	}
	return published
}

func TestExternoNoCanalComPermissaoPublicaEQuemRecebeResolve(t *testing.T) {
	e := newExternalDB(t)

	before, err := e.resolver.Resolve(e.ctx, e.bia, []string{e.emoji}, nil)
	if err != nil || len(before.Emojis) != 0 {
		t.Fatalf("antes de usar, Bia não pode conhecer o emoji: %v %+v", err, before.Emojis)
	}

	msg, err := e.service.CreateChannelMessage(e.ctx, e.canal, e.ana, "oi "+e.token(), nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "oi "+e.token() {
		t.Fatalf("conteúdo = %q", msg.Content)
	}
	if !e.publicado(t, "server_emojis", e.emoji) {
		t.Fatal("emoji usado fora devia ficar publicado")
	}

	after, err := e.resolver.Resolve(e.ctx, e.bia, []string{e.emoji}, nil)
	if err != nil || len(after.Emojis) != 1 || after.Emojis[0].Name != "festa" || after.Emojis[0].Origin.ServerName != "Origem" {
		t.Fatalf("Bia devia ver de onde vem: %v %+v", err, after.Emojis)
	}
}

// O perfil privado da #528: quem não é membro não vê nome nem ícone.
func TestServidorPrivadoNaoVazaParaQuemRecebe(t *testing.T) {
	e := newExternalDB(t)
	if _, err := e.db.Exec(e.ctx, `INSERT INTO server_profiles (server_id, private) VALUES ($1, TRUE)`, e.origem); err != nil {
		t.Fatal(err)
	}
	if _, err := e.service.CreateChannelMessage(e.ctx, e.canal, e.ana, e.token(), nil, nil, nil, nil, nil); err != nil {
		t.Fatal(err)
	}
	outsider, err := e.resolver.Resolve(e.ctx, e.bia, []string{e.emoji}, nil)
	if err != nil || len(outsider.Emojis) != 1 {
		t.Fatalf("%v %+v", err, outsider)
	}
	if o := outsider.Emojis[0].Origin; o.ServerName != "" || o.ServerIconURL != nil || !o.Private {
		t.Fatalf("servidor privado vazou: %+v", o)
	}
	member, err := e.resolver.Resolve(e.ctx, e.ana, []string{e.emoji}, nil)
	if err != nil || member.Emojis[0].Origin.ServerName != "Origem" {
		t.Fatalf("membro vê o nome: %v %+v", err, member)
	}
}

func TestExternoNoCanalSemPermissao(t *testing.T) {
	e := newExternalDB(t)
	e.tirarPermissao(t)

	msg, err := e.service.CreateChannelMessage(e.ctx, e.canal, e.ana, "oi "+e.token(), nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "oi :festa:" {
		t.Fatalf("sem a permissão vira texto: %q", msg.Content)
	}
	if e.publicado(t, "server_emojis", e.emoji) {
		t.Fatal("uso recusado não pode publicar")
	}
	if _, err := e.service.CreateChannelMessage(e.ctx, e.canal, e.ana, "", nil, nil, &e.sticker, nil, nil); !errors.Is(err, ErrExternalExpression) {
		t.Fatalf("figurinha: %v", err)
	}
	if e.publicado(t, "server_stickers", e.sticker) {
		t.Fatal("figurinha recusada não pode publicar")
	}
	target, err := e.service.CreateChannelMessage(e.ctx, e.canal, e.bia, "alvo", nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.service.AddChannelReaction(e.ctx, e.canal, target.ID, e.ana, e.reaction()); !errors.Is(err, ErrExternalExpression) {
		t.Fatalf("reação: %v", err)
	}
}

func TestNaoMembroDaOrigemNaoUsa(t *testing.T) {
	e := newExternalDB(t)
	msg, err := e.service.CreateConversationMessage(e.ctx, e.dm, e.bia, e.token(), nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != ":festa:" {
		t.Fatalf("não membro: %q", msg.Content)
	}
	if _, err := e.service.CreateConversationMessage(e.ctx, e.dm, e.bia, "", nil, nil, &e.sticker, nil, nil); !errors.Is(err, ErrExternalExpression) {
		t.Fatalf("figurinha: %v", err)
	}
	if err := e.service.AddConversationReaction(e.ctx, e.dm, msg.ID, e.bia, e.reaction()); !errors.Is(err, ErrExternalExpression) {
		t.Fatalf("reação: %v", err)
	}
	if e.publicado(t, "server_emojis", e.emoji) || e.publicado(t, "server_stickers", e.sticker) {
		t.Fatal("uso recusado não pode publicar")
	}
}

func TestNaDMBastaSerMembro(t *testing.T) {
	e := newExternalDB(t)
	msg, err := e.service.CreateConversationMessage(e.ctx, e.dm, e.ana, "", nil, nil, &e.sticker, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if msg.StickerID == nil || *msg.StickerID != e.sticker || !e.publicado(t, "server_stickers", e.sticker) {
		t.Fatalf("figurinha na DM: %+v", msg)
	}
	found, err := e.repo.FindByID(e.ctx, msg.ID)
	if err != nil || found.Sticker == nil || found.Sticker.Name != "gato" {
		t.Fatalf("mensagem lida: %v %+v", err, found)
	}
	text, err := e.service.CreateConversationMessage(e.ctx, e.dm, e.ana, e.token(), nil, nil, nil, nil, nil)
	if err != nil || text.Content != e.token() {
		t.Fatalf("texto na DM: %v %+v", err, text)
	}
}

// Reação de fora agrupa: quem não é da origem se soma à que já está, com o
// mesmo token, mesmo que não pudesse criá-la.
func TestReacaoExternaAgrupa(t *testing.T) {
	e := newExternalDB(t)
	target, err := e.service.CreateChannelMessage(e.ctx, e.canal, e.bia, "alvo", nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.service.AddChannelReaction(e.ctx, e.canal, target.ID, e.bia, e.reaction()); !errors.Is(err, ErrExternalExpression) {
		t.Fatalf("Bia não pode criar: %v", err)
	}
	if err := e.service.AddChannelReaction(e.ctx, e.canal, target.ID, e.ana, e.reaction()); err != nil {
		t.Fatalf("Ana cria: %v", err)
	}
	if err := e.service.AddChannelReaction(e.ctx, e.canal, target.ID, e.bia, e.reaction()); err != nil {
		t.Fatalf("Bia se soma: %v", err)
	}
	var groups, total int
	if err := e.db.QueryRow(e.ctx, `SELECT COUNT(DISTINCT emoji), COUNT(*) FROM message_reactions WHERE message_id = $1`, target.ID).Scan(&groups, &total); err != nil {
		t.Fatal(err)
	}
	if groups != 1 || total != 2 {
		t.Fatalf("grupos = %d, total = %d; quer 1 e 2", groups, total)
	}
}

func TestApagadoNaOrigem(t *testing.T) {
	e := newExternalDB(t)
	msg, err := e.service.CreateConversationMessage(e.ctx, e.dm, e.ana, "", nil, nil, &e.sticker, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.db.Exec(e.ctx, `DELETE FROM server_stickers WHERE id = $1`, e.sticker); err != nil {
		t.Fatal(err)
	}
	found, err := e.repo.FindByID(e.ctx, msg.ID)
	if err != nil {
		t.Fatal(err)
	}
	if found.Sticker != nil || found.StickerID != nil || found.DeletedStickerName == nil || *found.DeletedStickerName != "gato" {
		t.Fatalf("figurinha apagada devia deixar o nome: %+v", found)
	}

	if _, err := e.db.Exec(e.ctx, `DELETE FROM server_emojis WHERE id = $1`, e.emoji); err != nil {
		t.Fatal(err)
	}
	set, err := e.resolver.Resolve(e.ctx, e.bia, []string{e.emoji}, nil)
	if err != nil || len(set.Emojis) != 1 || !set.Emojis[0].Deleted || set.Emojis[0].Name != "festa" {
		t.Fatalf("emoji apagado devia deixar o nome: %v %+v", err, set.Emojis)
	}
	if text, err := e.service.CreateConversationMessage(e.ctx, e.dm, e.ana, e.token(), nil, nil, nil, nil, nil); err != nil || text.Content != ":festa:" {
		t.Fatalf("emoji apagado vira texto: %v %+v", err, text)
	}
	if err := e.service.AddConversationReaction(e.ctx, e.dm, msg.ID, e.ana, e.reaction()); !errors.Is(err, ErrInvalidEmoji) {
		t.Fatalf("reação com emoji apagado: %v", err)
	}
}

// Editar passa pela mesma regra: não dá para pôr por edição o que não dá para enviar.
func TestEdicaoPassaPelaRegra(t *testing.T) {
	e := newExternalDB(t)
	e.tirarPermissao(t)
	msg, err := e.service.CreateChannelMessage(e.ctx, e.canal, e.ana, "oi", nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	edited, err := e.service.EditChannelMessage(e.ctx, e.canal, msg.ID, e.ana, "oi "+e.token())
	if err != nil {
		t.Fatal(err)
	}
	if edited.Content != "oi :festa:" {
		t.Fatalf("edição: %q", edited.Content)
	}
}

// Tirar reação não passa pela regra: quem perdeu o acesso à origem ainda tira a sua.
func TestTirarReacaoExternaSempreDa(t *testing.T) {
	e := newExternalDB(t)
	target, err := e.service.CreateChannelMessage(e.ctx, e.canal, e.bia, "alvo", nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.service.AddChannelReaction(e.ctx, e.canal, target.ID, e.ana, e.reaction()); err != nil {
		t.Fatal(err)
	}
	e.tirarPermissao(t)
	if err := e.service.RemoveChannelReaction(e.ctx, e.canal, target.ID, e.ana, e.reaction()); err != nil {
		t.Fatalf("tirar no canal: %v", err)
	}
	if err := e.service.RemoveChannelReaction(e.ctx, e.canal, target.ID, e.ana, "<:qualquer>"); !errors.Is(err, ErrInvalidEmoji) {
		t.Fatalf("emoji inválido: %v", err)
	}
	if err := e.service.RemoveChannelReaction(e.ctx, e.canal, uuid.NewString(), e.ana, e.reaction()); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("mensagem inexistente: %v", err)
	}
	if err := e.service.RemoveChannelReaction(e.ctx, e.canal, target.ID, e.ana, "👍"); err != nil {
		t.Fatalf("reação que não está: %v", err)
	}

	dm, err := e.service.CreateConversationMessage(e.ctx, e.dm, e.ana, "alvo", nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if err := e.service.AddConversationReaction(e.ctx, e.dm, dm.ID, e.ana, e.reaction()); err != nil {
		t.Fatalf("pôr na DM: %v", err)
	}
	if err := e.service.AddConversationReaction(e.ctx, e.dm, dm.ID, e.bia, e.reaction()); err != nil {
		t.Fatalf("somar-se na DM: %v", err)
	}
	if err := e.service.RemoveConversationReaction(e.ctx, e.dm, dm.ID, e.bia, e.reaction()); err != nil {
		t.Fatalf("tirar na DM: %v", err)
	}
	if err := e.service.RemoveConversationReaction(e.ctx, e.dm, dm.ID, e.bia, "👍"); err != nil {
		t.Fatalf("reação que não está na DM: %v", err)
	}
	if err := e.service.RemoveConversationReaction(e.ctx, e.dm, dm.ID, e.bia, "<:x>"); !errors.Is(err, ErrInvalidEmoji) {
		t.Fatalf("emoji inválido na DM: %v", err)
	}
	if err := e.service.RemoveConversationReaction(e.ctx, e.dm, uuid.NewString(), e.bia, "👍"); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("mensagem inexistente na DM: %v", err)
	}
	if err := e.service.AddConversationReaction(e.ctx, e.dm, uuid.NewString(), e.bia, "👍"); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("pôr em mensagem inexistente na DM: %v", err)
	}
	if err := e.service.AddConversationReaction(e.ctx, e.dm, dm.ID, e.bia, "<:x>"); !errors.Is(err, ErrInvalidEmoji) {
		t.Fatalf("pôr emoji inválido na DM: %v", err)
	}
}
