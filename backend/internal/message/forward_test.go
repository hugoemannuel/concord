package message

import (
	"context"
	"errors"
	"io"
	"os"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"
	"gin-quickstart/backend/internal/platform/media"
)

// Encaminhar (forward.go): o repositório em memória, o disco num t.TempDir()
// e as regras de acesso falsas.

type fakeForwardStore struct {
	msgs        map[string]*Message
	attachments map[string][]Attachment
	polls       map[string]bool
	created     []*Message
	createdAtts [][]storedAttachment
	createErr   error
}

func newFakeForwardStore(msgs ...*Message) *fakeForwardStore {
	s := &fakeForwardStore{msgs: map[string]*Message{}, attachments: map[string][]Attachment{}, polls: map[string]bool{}}
	for _, m := range msgs {
		s.msgs[m.ID] = m
	}
	return s
}

func (s *fakeForwardStore) FindByID(_ context.Context, id string) (*Message, error) {
	m, ok := s.msgs[id]
	if !ok {
		return nil, errors.New("no rows")
	}
	copied := *m
	return &copied, nil
}

func (s *fakeForwardStore) FindNewByID(ctx context.Context, id string) (*Message, error) {
	return s.FindByID(ctx, id)
}

func (s *fakeForwardStore) HasPoll(_ context.Context, id string) (bool, error) {
	return s.polls[id], nil
}

func (s *fakeForwardStore) AttachAttachments(_ context.Context, msgs []Message) error {
	for i := range msgs {
		msgs[i].Attachments = append([]Attachment(nil), s.attachments[msgs[i].ID]...)
	}
	return nil
}

func (s *fakeForwardStore) CreateForwarded(_ context.Context, msg *Message, atts []storedAttachment) error {
	if s.createErr != nil {
		return s.createErr
	}
	copied := *msg
	copied.CreatedAt = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
	s.msgs[msg.ID] = &copied
	for _, a := range atts {
		s.attachments[msg.ID] = append(s.attachments[msg.ID], a.Attachment)
	}
	s.created = append(s.created, &copied)
	s.createdAtts = append(s.createdAtts, atts)
	return nil
}

type fakeForwardDirectory struct{}

func (fakeForwardDirectory) ChannelOrigin(_ context.Context, channelID string) (ForwardOrigin, error) {
	if channelID != "geral" {
		return ForwardOrigin{}, errors.New("canal sumiu")
	}
	return ForwardOrigin{ChannelName: "geral", ServerID: "s1", ServerName: "Salinha"}, nil
}

// fakeComments anota os comentários enviados depois do encaminhamento.
type fakeComments struct {
	sent []Message
	err  error
}

func (c *fakeComments) CreateChannelMessage(_ context.Context, channelID, authorID, content string, _ *string, _ []string, _ *string, _ *string, _ *GifMetadata) (*Message, error) {
	return c.record(Message{ID: "comentario", ChannelID: &channelID, AuthorID: authorID, Content: content})
}

func (c *fakeComments) CreateConversationMessage(_ context.Context, conversationID, authorID, content string, _ *string, _ []string, _ *string, _ *string, _ *GifMetadata) (*Message, error) {
	return c.record(Message{ID: "comentario", ConversationID: &conversationID, AuthorID: authorID, Content: content})
}

func (c *fakeComments) record(m Message) (*Message, error) {
	if c.err != nil {
		return nil, c.err
	}
	c.sent = append(c.sent, m)
	return &m, nil
}

// createPublisher anota os message:create.
type createPublisher struct {
	fakePublisher
	creates []CreateEvent
}

func (p *createPublisher) PublishMessageCreate(event CreateEvent) {
	p.creates = append(p.creates, event)
}

type forwardEnv struct {
	f        *Forwarder
	store    *fakeForwardStore
	files    *media.Store
	pub      *createPublisher
	comments *fakeComments
}

const sender = permission.ViewChannel | permission.SendMessages | permission.AttachFiles

func newForwardEnv(t *testing.T, perms int64, access RoomAccess, msgs ...*Message) *forwardEnv {
	t.Helper()
	files, err := media.NewStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	env := &forwardEnv{store: newFakeForwardStore(msgs...), files: files, pub: &createPublisher{}, comments: &fakeComments{}}
	env.f = NewForwarder(ForwarderDeps{
		Store:     env.store,
		Files:     files,
		Space:     fakeSpace{ok: true},
		Rooms:     NewForwardRooms(access, allowAll{perms}),
		Directory: fakeForwardDirectory{},
		Comments:  env.comments,
		Events:    NewRoomEvents(env.pub, fakeRooms{}, fakeRooms{}),
	})
	return env
}

func authored(m *Message, username, displayName string) *Message {
	m.Author = &Author{ID: m.AuthorID, Username: username, DisplayName: displayName}
	m.CreatedAt = time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	return m
}

func toDM(messageID string) ForwardRequest {
	return ForwardRequest{Origin: Room{ChannelID: "geral"}, MessageID: messageID, UserID: "bia", Target: Room{ConversationID: "dm1"}}
}

func TestForwardCopiaTextoParaDMComAOrigem(t *testing.T) {
	src := authored(channelMsg("m1", "ana", "olha isso @caio"), "ana", "Ana")
	src.MentionEveryone = strPtr(MentionAll)
	env := newForwardEnv(t, sender, fakeAccess{}, src)

	res, err := env.f.Forward(context.Background(), toDM("m1"))
	if err != nil {
		t.Fatalf("Forward: %v", err)
	}
	got := res.Message
	if got.Content != "olha isso @caio" || got.AuthorID != "bia" || got.ConversationID == nil || *got.ConversationID != "dm1" || got.ChannelID != nil {
		t.Fatalf("mensagem encaminhada = %+v", got)
	}
	if got.MentionEveryone != nil {
		t.Fatal("encaminhar não pinga ninguém (@all vira texto)")
	}
	want := ForwardedFrom{MessageID: "m1", AuthorID: "ana", AuthorName: "Ana", AuthorUsername: "ana",
		ChannelID: strPtr("geral"), ChannelName: "geral", ServerID: strPtr("s1"), ServerName: "Salinha", CreatedAt: src.CreatedAt}
	if ff := got.ForwardedFrom; ff == nil || ff.MessageID != want.MessageID || ff.AuthorName != "Ana" || *ff.ChannelID != "geral" ||
		ff.ChannelName != "geral" || *ff.ServerID != "s1" || ff.ServerName != "Salinha" || !ff.CreatedAt.Equal(want.CreatedAt) || ff.ConversationID != nil {
		t.Fatalf("forwarded_from = %+v, want %+v", got.ForwardedFrom, want)
	}
	if len(env.pub.creates) != 1 || len(env.pub.creates[0].UserIDs) != 2 || env.pub.creates[0].ConversationID == nil {
		t.Fatalf("message:create = %+v", env.pub.creates)
	}
	if res.Comment != nil || len(env.comments.sent) != 0 {
		t.Fatal("sem comentário, só a mensagem encaminhada")
	}
}

func TestForwardDeDMParaCanalGuardaSoAConversa(t *testing.T) {
	src := authored(convMsg("d1", "ana", "segredo"), "ana", "Ana")
	env := newForwardEnv(t, sender, fakeAccess{}, src)

	res, err := env.f.Forward(context.Background(), ForwardRequest{Origin: Room{ConversationID: "dm1"}, MessageID: "d1", UserID: "bia", Target: Room{ChannelID: "geral"}})
	if err != nil {
		t.Fatalf("Forward: %v", err)
	}
	ff := res.Message.ForwardedFrom
	if ff == nil || ff.ConversationID == nil || *ff.ConversationID != "dm1" || ff.ChannelID != nil || ff.ServerName != "" {
		t.Fatalf("forwarded_from = %+v", ff)
	}
	if ev := env.pub.creates; len(ev) != 1 || ev[0].ServerID != "s1" || ev[0].ChannelID == nil {
		t.Fatalf("message:create = %+v", ev)
	}
}

func TestForwardDeEncaminhadaMantemAOrigemPrimeira(t *testing.T) {
	first := &ForwardedFrom{MessageID: "m0", AuthorID: "caio", AuthorName: "Caio", ChannelID: strPtr("outro")}
	src := authored(channelMsg("m1", "ana", "repassando"), "ana", "Ana")
	src.ForwardedFrom = first
	env := newForwardEnv(t, sender, fakeAccess{}, src)

	res, err := env.f.Forward(context.Background(), toDM("m1"))
	if err != nil {
		t.Fatalf("Forward: %v", err)
	}
	if ff := res.Message.ForwardedFrom; ff == nil || ff.MessageID != "m0" || ff.AuthorName != "Caio" {
		t.Fatalf("forwarded_from = %+v, want a origem primeira", ff)
	}
}

func TestForwardCopiaOsArquivosParaODestino(t *testing.T) {
	src := authored(channelMsg("m1", "ana", ""), "ana", "Ana")
	env := newForwardEnv(t, sender, fakeAccess{}, src)
	const fileID = "6a4f4b8e-36a8-4a43-9d7a-0d86c2e2f001"
	if _, _, err := env.files.Save(fileID, strings.NewReader("conteúdo da foto"), 1<<20); err != nil {
		t.Fatal(err)
	}
	env.store.attachments["m1"] = []Attachment{{ID: fileID, Kind: "image", ContentType: "image/png", Filename: "foto.png", SizeBytes: 17}}

	res, err := env.f.Forward(context.Background(), toDM("m1"))
	if err != nil {
		t.Fatalf("Forward: %v", err)
	}
	atts := env.store.createdAtts[0]
	if len(atts) != 1 || atts[0].ID == fileID || atts[0].Filename != "foto.png" || atts[0].UploaderID != "bia" ||
		atts[0].ConversationID == nil || *atts[0].ConversationID != "dm1" {
		t.Fatalf("anexos gravados = %+v", atts)
	}
	f, err := env.files.Open(atts[0].ID)
	if err != nil {
		t.Fatalf("cópia no disco: %v", err)
	}
	defer f.Close()
	if body, _ := io.ReadAll(f); string(body) != "conteúdo da foto" {
		t.Fatalf("cópia = %q", body)
	}
	if len(res.Message.Attachments) != 1 {
		t.Fatalf("resposta sem o anexo: %+v", res.Message)
	}
}

func TestForwardQueFalhaNoBancoApagaAsCopias(t *testing.T) {
	src := authored(channelMsg("m1", "ana", "foto"), "ana", "Ana")
	env := newForwardEnv(t, sender, fakeAccess{}, src)
	const fileID = "6a4f4b8e-36a8-4a43-9d7a-0d86c2e2f002"
	if _, _, err := env.files.Save(fileID, strings.NewReader("x"), 10); err != nil {
		t.Fatal(err)
	}
	env.store.attachments["m1"] = []Attachment{{ID: fileID, Kind: "file", Filename: "a.txt", SizeBytes: 1}}
	env.store.createErr = errors.New("banco caiu")

	if _, err := env.f.Forward(context.Background(), toDM("m1")); err == nil {
		t.Fatal("erro do banco precisa voltar")
	}
	list, err := env.files.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 {
		t.Fatalf("arquivos no disco = %+v, want só o original", list)
	}
	if len(env.pub.creates) != 0 {
		t.Fatal("falhou: não publica")
	}
}

func TestForwardComComentarioEnviaDepois(t *testing.T) {
	src := authored(channelMsg("m1", "ana", "oi"), "ana", "Ana")
	env := newForwardEnv(t, sender, fakeAccess{}, src)
	req := toDM("m1")
	req.Comment = "  vê isso  "

	res, err := env.f.Forward(context.Background(), req)
	if err != nil {
		t.Fatalf("Forward: %v", err)
	}
	if res.Comment == nil || len(env.comments.sent) != 1 || env.comments.sent[0].Content != "vê isso" || *env.comments.sent[0].ConversationID != "dm1" {
		t.Fatalf("comentário = %+v", env.comments.sent)
	}
}

func TestForwardComentarioQueFalhaNaoDesfazOEncaminhamento(t *testing.T) {
	src := authored(channelMsg("m1", "ana", "oi"), "ana", "Ana")
	env := newForwardEnv(t, sender, fakeAccess{}, src)
	env.comments.err = errors.New("falhou")
	req := toDM("m1")
	req.Comment = "vê"

	res, err := env.f.Forward(context.Background(), req)
	if err != nil || res.Message == nil || res.Comment != nil {
		t.Fatalf("res = %+v, err = %v", res, err)
	}
}

func TestForwardRecusa(t *testing.T) {
	poll := authored(channelMsg("poll", "ana", "qual?"), "ana", "Ana")
	system := authored(channelMsg("sys", "ana", "parabéns"), "ana", "Ana")
	system.SystemKind = strPtr("birthday")
	invite := authored(convMsg("inv", "ana", CallInviteContent), "ana", "Ana")
	invite.CallInvite = &CallInvite{CallID: "c1"}
	empty := authored(channelMsg("vazia", "ana", ""), "ana", "Ana")
	viewOnce := authored(convMsg("vo", "ana", "olha"), "ana", "Ana")
	viewOnce.ViewOnce = &ViewOnceMedia{ID: "a1", Kind: "image"}
	other := authored(channelMsg("outra", "ana", "oi"), "ana", "Ana")
	other.ChannelID = strPtr("outro-canal")
	ok := authored(channelMsg("ok", "ana", "oi"), "ana", "Ana")
	toChannel := ForwardRequest{Origin: Room{ChannelID: "geral"}, MessageID: "ok", UserID: "bia", Target: Room{ChannelID: "geral"}}

	cases := []struct {
		name   string
		perms  int64
		access RoomAccess
		req    ForwardRequest
		want   error
	}{
		{"enquete", sender, fakeAccess{}, toDM("poll"), ErrNotForwardable},
		{"mensagem do sistema", sender, fakeAccess{}, toDM("sys"), ErrNotForwardable},
		{"convite para call", sender, fakeAccess{}, ForwardRequest{Origin: Room{ConversationID: "dm1"}, MessageID: "inv", UserID: "bia", Target: Room{ConversationID: "dm1"}}, ErrNotForwardable},
		{"visualização única", sender, fakeAccess{}, ForwardRequest{Origin: Room{ConversationID: "dm1"}, MessageID: "vo", UserID: "bia", Target: Room{ConversationID: "dm1"}}, ErrNotForwardable},
		{"sem nada para levar", sender, fakeAccess{}, toDM("vazia"), ErrNotForwardable},
		{"mensagem de outra sala", sender, fakeAccess{}, toDM("outra"), ErrMessageNotFound},
		{"mensagem que não existe", sender, fakeAccess{}, toDM("nada"), ErrMessageNotFound},
		{"origem que não lê", sender, fakeAccess{readErr: ErrNoRoomAccess}, toDM("outra"), ErrNoRoomAccess},
		{"DM bloqueada", sender, fakeAccess{writeErr: ErrBlocked}, toDM("ok"), ErrBlocked},
		{"canal sem enviar", permission.ViewChannel, fakeAccess{}, toChannel, ErrNoRoomAccess},
		{"canal que não vê", 0, fakeAccess{}, toChannel, ErrRoomNotFound},
		{"sem destino", sender, fakeAccess{}, ForwardRequest{Origin: Room{ChannelID: "geral"}, MessageID: "poll", UserID: "bia"}, ErrInvalidForwardTarget},
		{"dois destinos", sender, fakeAccess{}, ForwardRequest{Origin: Room{ChannelID: "geral"}, MessageID: "poll", UserID: "bia", Target: Room{ChannelID: "geral", ConversationID: "dm1"}}, ErrInvalidForwardTarget},
		{"comentário longo", sender, fakeAccess{}, ForwardRequest{Origin: Room{ChannelID: "geral"}, MessageID: "poll", UserID: "bia", Target: Room{ConversationID: "dm1"}, Comment: strings.Repeat("a", MaxMessageLength+1)}, ErrContentTooLong},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			env := newForwardEnv(t, tc.perms, tc.access, poll, system, invite, empty, viewOnce, other, ok)
			env.store.polls["poll"] = true
			_, err := env.f.Forward(context.Background(), tc.req)
			if !errors.Is(err, tc.want) {
				t.Fatalf("err = %v, want %v", err, tc.want)
			}
			if len(env.store.created) != 0 || len(env.pub.creates) != 0 {
				t.Fatal("recusado não grava nem publica")
			}
		})
	}
}

func TestForwardAnexoNoCanalPedeAttachFiles(t *testing.T) {
	src := authored(convMsg("d1", "ana", ""), "ana", "Ana")
	env := newForwardEnv(t, permission.ViewChannel|permission.SendMessages, fakeAccess{}, src)
	env.store.attachments["d1"] = []Attachment{{ID: "6a4f4b8e-36a8-4a43-9d7a-0d86c2e2f003", Kind: "file", SizeBytes: 1}}

	_, err := env.f.Forward(context.Background(), ForwardRequest{Origin: Room{ConversationID: "dm1"}, MessageID: "d1", UserID: "bia", Target: Room{ChannelID: "geral"}})
	if !errors.Is(err, ErrNoRoomAccess) {
		t.Fatalf("err = %v, want ErrNoRoomAccess", err)
	}
}

func TestForwardSemEspacoNoDisco(t *testing.T) {
	src := authored(channelMsg("m1", "ana", ""), "ana", "Ana")
	env := newForwardEnv(t, sender, fakeAccess{}, src)
	env.f.space = fakeSpace{ok: false}
	env.store.attachments["m1"] = []Attachment{{ID: "6a4f4b8e-36a8-4a43-9d7a-0d86c2e2f004", Kind: "file", SizeBytes: 1}}

	if _, err := env.f.Forward(context.Background(), toDM("m1")); !errors.Is(err, ErrForwardNoSpace) {
		t.Fatalf("err = %v, want ErrForwardNoSpace", err)
	}
}

func TestForwardArquivoQueSumiuDoDisco(t *testing.T) {
	src := authored(channelMsg("m1", "ana", "foto"), "ana", "Ana")
	env := newForwardEnv(t, sender, fakeAccess{}, src)
	env.store.attachments["m1"] = []Attachment{{ID: "6a4f4b8e-36a8-4a43-9d7a-0d86c2e2f005", Kind: "file", SizeBytes: 1}}

	_, err := env.f.Forward(context.Background(), toDM("m1"))
	if !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("err = %v, want arquivo inexistente", err)
	}
}

func TestParseForwardedFrom(t *testing.T) {
	if parseForwardedFrom(nil) != nil || parseForwardedFrom([]byte("{")) != nil || parseForwardedFrom([]byte(`{"author_id":"a"}`)) != nil {
		t.Fatal("vazio, ilegível ou sem message_id = mensagem comum")
	}
	ff := parseForwardedFrom(forwardedFromBytes(&ForwardedFrom{MessageID: "m1", AuthorName: "Ana"}))
	if ff == nil || ff.MessageID != "m1" || ff.AuthorName != "Ana" {
		t.Fatalf("ida e volta = %+v", ff)
	}
	if forwardedFromBytes(nil) != nil {
		t.Fatal("nil = coluna nula")
	}
}
