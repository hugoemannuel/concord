package message_test

import (
	"context"
	"os"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/message"
	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/database"
	"gin-quickstart/backend/internal/role"
	"gin-quickstart/backend/internal/server"

	"github.com/google/uuid"
)

// capturePublisher guarda o último message:create publicado.
type capturePublisher struct {
	message.EventPublisher
	last *message.CreateEvent
}

func (p *capturePublisher) PublishMessageCreate(e message.CreateEvent) { p.last = &e }

// Do serviço ao banco (TEST_DATABASE_URL): a mensagem com cargo marcado sai
// com mention_roles na resposta e no evento, com ou sem anexo; cargo fechado
// pedido por quem não pode é ignorado.
func TestChannelMessageWithRolesDB(t *testing.T) {
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
	if err := database.Migrate(db, "../../migrations"); err != nil {
		t.Fatal(err)
	}
	owner, member := uuid.NewString(), uuid.NewString()
	for _, id := range []string{owner, member} {
		if _, err := db.Exec(ctx, `INSERT INTO users (id, username, display_name, email, password_hash) VALUES ($1, $2::text, $2::text, $2::text || '@ex.com', 'x')`, id, "r"+id[:8]); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM users WHERE id = ANY($1)`, []string{owner, member}) })

	perms := permission.PermissionService(permission.PermissionRepository(db))
	serverRepo := server.ServerRepository(db)
	serverRepo.SetPermissionCache(perms)
	roleRepo := role.RoleRepository(db)
	srv := &server.Server{Name: "s", OwnerID: owner}
	if err := server.ServerService(serverRepo, nil, roleRepo).Create(ctx, srv); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Exec(ctx, `DELETE FROM servers WHERE id = $1`, srv.ID) })
	if _, err := db.Exec(ctx, `INSERT INTO server_members (server_id, user_id) VALUES ($1, $2)`, srv.ID, member); err != nil {
		t.Fatal(err)
	}
	channels := channel.ChannelService(channel.ChannelRepository(db), nil)
	channels.SetPermissionCache(perms)
	ch := &channel.Channel{ServerID: srv.ID, Name: "geral", Type: channel.TypeText, CreatedBy: owner}
	if err := channels.Create(ctx, ch); err != nil {
		t.Fatal(err)
	}
	aberto := &role.Role{ServerID: srv.ID, Name: "Suporte", Mentionable: true}
	fechado := &role.Role{ServerID: srv.ID, Name: "Equipe de Suporte"}
	for _, r := range []*role.Role{aberto, fechado} {
		if err := roleRepo.Create(ctx, r); err != nil {
			t.Fatal(err)
		}
	}
	perms.InvalidateServer(srv.ID)

	publisher := &capturePublisher{}
	svc := message.MessageService(message.MessageRepository(db), publisher, perms, nil, nil, perms)
	svc.SetRoleSource(perms)
	ids := []string{aberto.ID, fechado.ID}
	const text = "@suporte e @equipe-de-suporte"
	suporte := message.RoleMention{ID: aberto.ID, Handle: "suporte"}
	equipe := message.RoleMention{ID: fechado.ID, Handle: "equipe-de-suporte"}

	// O dono pode tudo: pinga os dois.
	msg, err := svc.CreateChannelMessageWithRoles(ctx, ch.ID, owner, text, nil, nil, nil, nil, nil, ids)
	if err != nil {
		t.Fatal(err)
	}
	want := []message.RoleMention{suporte, equipe}
	if !reflect.DeepEqual(msg.MentionRoles, want) {
		t.Fatalf("dono: got %v, want %v", msg.MentionRoles, want)
	}
	if publisher.last == nil || !reflect.DeepEqual(publisher.last.Message.MentionRoles, want) {
		t.Fatalf("evento publicado sem os cargos: %+v", publisher.last)
	}

	// Membro comum: só o cargo aberto; e com anexo o caminho é outro INSERT.
	attachmentID := uuid.NewString()
	if _, err := db.Exec(ctx, `INSERT INTO message_attachments (id, uploader_id, channel_id, kind, content_type, filename, size_bytes) VALUES ($1, $2, $3, 'image', 'image/png', 'a.png', 10)`, attachmentID, member, ch.ID); err != nil {
		t.Fatal(err)
	}
	withFile, err := svc.CreateChannelMessageWithRoles(ctx, ch.ID, member, text, nil, []string{attachmentID}, nil, nil, nil, ids)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(withFile.MentionRoles, []message.RoleMention{suporte}) {
		t.Fatalf("membro com anexo: got %v", withFile.MentionRoles)
	}

	// Sem os ids, o mesmo texto não pinga cargo nenhum.
	plain, err := svc.CreateChannelMessage(ctx, ch.ID, owner, text, nil, nil, nil, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	if plain.MentionRoles != nil {
		t.Fatalf("texto sozinho pingou: %v", plain.MentionRoles)
	}
}
