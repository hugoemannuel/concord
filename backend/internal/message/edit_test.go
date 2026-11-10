package message

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/permission"

	"github.com/gin-gonic/gin"
)

// fakeEditStore guarda as mensagens em memória para os testes de edição.
type fakeEditStore struct {
	msgs        map[string]*Message
	attachments map[string][]string
	polls       map[string]bool
	updates     int
}

func newFakeEditStore(msgs ...*Message) *fakeEditStore {
	s := &fakeEditStore{msgs: map[string]*Message{}, attachments: map[string][]string{}, polls: map[string]bool{}}
	for _, m := range msgs {
		s.msgs[m.ID] = m
	}
	return s
}

func (s *fakeEditStore) FindByID(_ context.Context, id string) (*Message, error) {
	m, ok := s.msgs[id]
	if !ok {
		return nil, errors.New("no rows")
	}
	copied := *m
	return &copied, nil
}

func (s *fakeEditStore) MessageAttachmentIDs(_ context.Context, id string) ([]string, error) {
	return s.attachments[id], nil
}

func (s *fakeEditStore) HasPoll(_ context.Context, id string) (bool, error) {
	return s.polls[id], nil
}

func (s *fakeEditStore) UpdateContent(_ context.Context, id string, authorID string, content string, mentionEveryone *string) error {
	m, ok := s.msgs[id]
	if !ok || m.AuthorID != authorID {
		return ErrMessageNotFound
	}
	s.updates++
	now := time.Date(2026, 10, 25, 15, 0, 0, 0, time.UTC)
	m.Content = content
	m.MentionEveryone = mentionEveryone
	m.EditedAt = &now
	return nil
}

func (s *fakeEditStore) AttachAttachments(_ context.Context, msgs []Message) error {
	for i := range msgs {
		for _, id := range s.attachments[msgs[i].ID] {
			msgs[i].Attachments = append(msgs[i].Attachments, Attachment{ID: id})
		}
	}
	return nil
}

// fakePublisher anota os eventos publicados.
type fakePublisher struct {
	updates []UpdateEvent
}

func (p *fakePublisher) PublishMessageCreate(CreateEvent)       {}
func (p *fakePublisher) PublishMessageDelete(DeleteEvent)       {}
func (p *fakePublisher) PublishMessagePin(PinEvent)             {}
func (p *fakePublisher) PublishMessageUnpin(UnpinEvent)         {}
func (p *fakePublisher) PublishPollUpdate(PollUpdateEvent)      {}
func (p *fakePublisher) PublishReactionAdd(ReactionEvent)       {}
func (p *fakePublisher) PublishReactionRemove(ReactionEvent)    {}
func (p *fakePublisher) PublishMessageUpdate(event UpdateEvent) { p.updates = append(p.updates, event) }

type fakeRooms struct{}

func (fakeRooms) ChannelServerID(context.Context, string) (string, error) { return "s1", nil }
func (fakeRooms) ConversationParticipantIDs(context.Context, string) ([]string, error) {
	return []string{"ana", "bia"}, nil
}
func (fakeRooms) RevealConversation(context.Context, string) error { return nil }

func strPtr(s string) *string { return &s }

func editEnv(msgs ...*Message) (*Service, *fakeEditStore, *fakePublisher) {
	store := newFakeEditStore(msgs...)
	pub := &fakePublisher{}
	s := &Service{
		edits:           store,
		publisher:       pub,
		channelResolver: fakeRooms{},
		convResolver:    fakeRooms{},
		mentionLimiter:  newMentionLimiter(mentionEveryoneCooldown, time.Now),
	}
	return s, store, pub
}

func channelMsg(id, author, content string) *Message {
	return &Message{ID: id, AuthorID: author, ChannelID: strPtr("geral"), Content: content}
}

func convMsg(id, author, content string) *Message {
	return &Message{ID: id, AuthorID: author, ConversationID: strPtr("dm1"), Content: content}
}

func TestEditChannelMessageOnlyAuthor(t *testing.T) {
	s, store, pub := editEnv(channelMsg("m1", "ana", "oi"))
	ctx := context.Background()

	if _, err := s.EditChannelMessage(ctx, "geral", "m1", "bia", "hackeado"); !errors.Is(err, ErrNotEditAuthor) {
		t.Fatalf("outra pessoa editando: err = %v, want ErrNotEditAuthor", err)
	}
	if store.updates != 0 || len(pub.updates) != 0 {
		t.Fatal("edição negada não grava nem publica")
	}

	msg, err := s.EditChannelMessage(ctx, "geral", "m1", "ana", "oi, gente")
	if err != nil {
		t.Fatal(err)
	}
	if msg.Content != "oi, gente" || msg.EditedAt == nil {
		t.Fatalf("mensagem editada = %+v", msg)
	}
}

func TestEditMessageInOtherRoomIsNotFound(t *testing.T) {
	s, _, _ := editEnv(channelMsg("m1", "ana", "oi"), convMsg("d1", "ana", "oi"))
	ctx := context.Background()

	if _, err := s.EditChannelMessage(ctx, "outro", "m1", "ana", "x"); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("canal errado: err = %v", err)
	}
	if _, err := s.EditChannelMessage(ctx, "geral", "d1", "ana", "x"); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("mensagem de DM pela rota do canal: err = %v", err)
	}
	if _, err := s.EditConversationMessage(ctx, "dm1", "m1", "ana", "x"); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("mensagem de canal pela rota da DM: err = %v", err)
	}
	if _, err := s.EditConversationMessage(ctx, "dm1", "nada", "ana", "x"); !errors.Is(err, ErrMessageNotFound) {
		t.Fatalf("mensagem inexistente: err = %v", err)
	}
}

func TestEditConversationMessageOnlyAuthor(t *testing.T) {
	s, _, pub := editEnv(convMsg("d1", "ana", "oi"))
	ctx := context.Background()

	if _, err := s.EditConversationMessage(ctx, "dm1", "d1", "bia", "x"); !errors.Is(err, ErrNotEditAuthor) {
		t.Fatalf("err = %v, want ErrNotEditAuthor", err)
	}
	if _, err := s.EditConversationMessage(ctx, "dm1", "d1", "ana", "oi!"); err != nil {
		t.Fatal(err)
	}
	if len(pub.updates) != 1 {
		t.Fatalf("publicou %d eventos, want 1", len(pub.updates))
	}
}

func TestEditValidatesContentLikeCreate(t *testing.T) {
	withFile := channelMsg("f1", "ana", "foto")
	s, store, _ := editEnv(channelMsg("m1", "ana", "oi"), withFile)
	store.attachments["f1"] = []string{"a1"}
	ctx := context.Background()

	if _, err := s.EditChannelMessage(ctx, "geral", "m1", "ana", ""); !errors.Is(err, ErrContentRequired) {
		t.Fatalf("texto vazio sem anexo: err = %v", err)
	}
	if _, err := s.EditChannelMessage(ctx, "geral", "m1", "ana", "  \n "); !errors.Is(err, ErrContentRequired) {
		t.Fatalf("só espaços sem anexo: err = %v", err)
	}
	if _, err := s.EditChannelMessage(ctx, "geral", "m1", "ana", strings.Repeat("é", MaxMessageLength+1)); !errors.Is(err, ErrContentTooLong) {
		t.Fatalf("texto longo demais: err = %v", err)
	}
	if _, err := s.EditChannelMessage(ctx, "geral", "m1", "ana", strings.Repeat("é", MaxMessageLength)); err != nil {
		t.Fatalf("no limite (conta caracteres, não bytes): err = %v", err)
	}

	msg, err := s.EditChannelMessage(ctx, "geral", "f1", "ana", "")
	if err != nil {
		t.Fatalf("mensagem com anexo pode ficar sem texto: err = %v", err)
	}
	if msg.Content != "" || len(msg.Attachments) != 1 {
		t.Fatalf("mensagem = %+v, want sem texto e com o anexo", msg)
	}

	withGif := channelMsg("g1", "ana", "olha esse gif")
	withGif.GifURL = strPtr("https://media.giphy.com/media/test/giphy.gif")
	store.msgs["g1"] = withGif
	gifEdited, err := s.EditChannelMessage(ctx, "geral", "g1", "ana", "")
	if err != nil {
		t.Fatalf("mensagem com GIF pode ficar sem texto: err = %v", err)
	}
	if gifEdited.Content != "" || gifEdited.GifURL == nil {
		t.Fatalf("mensagem com GIF editada = %+v", gifEdited)
	}
}

func TestCreateValidatesLength(t *testing.T) {
	if err := validateNewMessage(strings.Repeat("a", MaxMessageLength+1), nil); !errors.Is(err, ErrContentTooLong) {
		t.Fatalf("err = %v, want ErrContentTooLong", err)
	}
	if err := validateNewMessage("   ", nil); !errors.Is(err, ErrContentRequired) {
		t.Fatalf("só espaços: err = %v, want ErrContentRequired", err)
	}
	if err := validateNewMessage("", []string{"a1"}); err != nil {
		t.Fatalf("só anexo: err = %v", err)
	}
}

func TestEditRejectsSystemAndPollMessages(t *testing.T) {
	system := channelMsg("sys", "ana", "Feliz aniversário!")
	system.SystemKind = strPtr("birthday")
	s, store, _ := editEnv(system, channelMsg("p1", "ana", ""))
	store.polls["p1"] = true
	ctx := context.Background()

	if _, err := s.EditChannelMessage(ctx, "geral", "sys", "ana", "x"); !errors.Is(err, ErrNotEditable) {
		t.Fatalf("mensagem do sistema: err = %v", err)
	}
	if _, err := s.EditChannelMessage(ctx, "geral", "p1", "ana", "x"); !errors.Is(err, ErrNotEditable) {
		t.Fatalf("enquete: err = %v", err)
	}
}

// A encaminhada é a foto da original: quem encaminhou não troca o texto dela.
func TestEditRejectsForwardedMessage(t *testing.T) {
	fwd := channelMsg("f1", "ana", "texto da original")
	fwd.ForwardedFrom = &ForwardedFrom{MessageID: "m0", AuthorID: "bia"}
	s, store, _ := editEnv(fwd)

	if _, err := s.EditChannelMessage(context.Background(), "geral", "f1", "ana", "outro"); !errors.Is(err, ErrNotEditable) {
		t.Fatalf("err = %v, want ErrNotEditable", err)
	}
	if store.updates != 0 {
		t.Fatal("não grava")
	}
}

func TestEditBroadcastsToSameRoomsAsCreate(t *testing.T) {
	s, _, pub := editEnv(channelMsg("m1", "ana", "oi"), convMsg("d1", "ana", "oi"))
	ctx := context.Background()

	if _, err := s.EditChannelMessage(ctx, "geral", "m1", "ana", "oi!"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.EditConversationMessage(ctx, "dm1", "d1", "ana", "oi!"); err != nil {
		t.Fatal(err)
	}
	if len(pub.updates) != 2 {
		t.Fatalf("publicou %d, want 2", len(pub.updates))
	}

	ch := pub.updates[0]
	if ch.ChannelID == nil || *ch.ChannelID != "geral" || ch.ServerID != "s1" || ch.Message.Content != "oi!" || ch.Message.EditedAt == nil {
		t.Fatalf("evento do canal = %+v", ch)
	}
	dm := pub.updates[1]
	if dm.ConversationID == nil || *dm.ConversationID != "dm1" || len(dm.UserIDs) != 2 || dm.Message.Content != "oi!" {
		t.Fatalf("evento da DM = %+v", dm)
	}
}

func TestEditWithSameContentChangesNothing(t *testing.T) {
	s, store, pub := editEnv(channelMsg("m1", "ana", "oi"))
	msg, err := s.EditChannelMessage(context.Background(), "geral", "m1", "ana", "oi")
	if err != nil {
		t.Fatal(err)
	}
	if store.updates != 0 || len(pub.updates) != 0 || msg.EditedAt != nil {
		t.Fatal("mesmo texto não marca (editada) nem publica")
	}
}

// Edição nunca pinga de novo: só mantém (ou tira) o @all/@here que já pingou.
func TestEditedMentionEveryone(t *testing.T) {
	all, here := strPtr(MentionAll), strPtr(MentionHere)
	cases := []struct {
		name     string
		original *string
		content  string
		want     *string
	}{
		{"não pingava e ganhou @all: continua sem pingar", nil, "@all bora", nil},
		{"pingou @all e manteve: continua", all, "@all bora, gente", all},
		{"pingou @all e tirou: para de destacar", all, "bora, gente", nil},
		{"pingou @here e trocou por @all: não sobe para @all e o @here sumiu", here, "@all bora", nil},
		{"pingou @all e trocou por @here: o @all sumiu", all, "@here bora", nil},
		{"pingou @here e tem os dois: fica @here", here, "@all e @here bora", here},
		{"pingou @all e tem os dois: fica @all", all, "@here e @all bora", all},
		{"pingou @all e só sobrou @allan: não marca mais", all, "@allan bora", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := editedMentionEveryone(tc.original, tc.content)
			if (got == nil) != (tc.want == nil) || (got != nil && *got != *tc.want) {
				t.Fatalf("got %v, want %v", deref(got), deref(tc.want))
			}
		})
	}
}

func deref(s *string) string {
	if s == nil {
		return "<nil>"
	}
	return *s
}

func TestEditChannelMessageStoresMentionDecision(t *testing.T) {
	original := channelMsg("m1", "ana", "@all bora")
	original.MentionEveryone = strPtr(MentionAll)
	s, store, pub := editEnv(original, channelMsg("m2", "ana", "oi"))
	ctx := context.Background()

	if _, err := s.EditChannelMessage(ctx, "geral", "m1", "ana", "bora"); err != nil {
		t.Fatal(err)
	}
	if store.msgs["m1"].MentionEveryone != nil || pub.updates[0].Message.MentionEveryone != nil {
		t.Fatal("tirou o @all: mention_everyone vira null")
	}
	if _, err := s.EditChannelMessage(ctx, "geral", "m2", "ana", "@all oi"); err != nil {
		t.Fatal(err)
	}
	if store.msgs["m2"].MentionEveryone != nil {
		t.Fatal("@all adicionado na edição não pinga")
	}
}

// editRouter monta as rotas com um usuário fixo e permissões de mentira.
func editRouter(s *Service, userID string, perms PermissionChecker, access RoomAccess) *gin.Engine {
	gin.SetMode(gin.TestMode)
	h := &Handler{service: s, perms: perms, access: access}
	router := gin.New()
	MessageRoutes(router.Group("/api"), h, func(c *gin.Context) {
		c.Set("userID", userID)
		c.Next()
	})
	return router
}

type allowAll struct{ perms int64 }

func (a allowAll) ChannelPerms(context.Context, string, string) (int64, error) { return a.perms, nil }

func patch(router *gin.Engine, path string, body any) *httptest.ResponseRecorder {
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPatch, path, bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)
	return rec
}

func TestEditHandlers(t *testing.T) {
	member := allowAll{permission.ViewChannel | permission.SendMessages}

	t.Run("autor edita no canal", func(t *testing.T) {
		s, _, pub := editEnv(channelMsg("m1", "ana", "oi"))
		rec := patch(editRouter(s, "ana", member, fakeAccess{}), "/api/channels/geral/messages/m1", map[string]string{"content": "oi!"})
		if rec.Code != http.StatusOK {
			t.Fatalf("status %d: %s", rec.Code, rec.Body)
		}
		var got Message
		_ = json.Unmarshal(rec.Body.Bytes(), &got)
		if got.Content != "oi!" || got.EditedAt == nil || len(pub.updates) != 1 {
			t.Fatalf("resposta = %+v", got)
		}
	})

	t.Run("outra pessoa recebe 403", func(t *testing.T) {
		s, _, _ := editEnv(channelMsg("m1", "ana", "oi"))
		rec := patch(editRouter(s, "bia", member, fakeAccess{}), "/api/channels/geral/messages/m1", map[string]string{"content": "x"})
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status %d, want 403", rec.Code)
		}
	})

	t.Run("sem SEND_MESSAGES no canal não edita", func(t *testing.T) {
		s, _, _ := editEnv(channelMsg("m1", "ana", "oi"))
		rec := patch(editRouter(s, "ana", allowAll{permission.ViewChannel}, fakeAccess{}), "/api/channels/geral/messages/m1", map[string]string{"content": "x"})
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status %d, want 403", rec.Code)
		}
	})

	t.Run("texto vazio recebe 400", func(t *testing.T) {
		s, _, _ := editEnv(channelMsg("m1", "ana", "oi"))
		rec := patch(editRouter(s, "ana", member, fakeAccess{}), "/api/channels/geral/messages/m1", map[string]string{"content": ""})
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("status %d, want 400", rec.Code)
		}
	})

	t.Run("mensagem inexistente recebe 404", func(t *testing.T) {
		s, _, _ := editEnv()
		rec := patch(editRouter(s, "ana", member, fakeAccess{}), "/api/channels/geral/messages/nada", map[string]string{"content": "x"})
		if rec.Code != http.StatusNotFound {
			t.Fatalf("status %d, want 404", rec.Code)
		}
	})

	t.Run("autor edita na DM", func(t *testing.T) {
		s, _, pub := editEnv(convMsg("d1", "ana", "oi"))
		rec := patch(editRouter(s, "ana", member, fakeAccess{}), "/api/conversations/dm1/messages/d1", map[string]string{"content": "oi!"})
		if rec.Code != http.StatusOK || len(pub.updates) != 1 {
			t.Fatalf("status %d: %s", rec.Code, rec.Body)
		}
	})

	t.Run("DM bloqueada não edita", func(t *testing.T) {
		s, _, _ := editEnv(convMsg("d1", "ana", "oi"))
		rec := patch(editRouter(s, "ana", member, fakeAccess{writeErr: ErrBlocked}), "/api/conversations/dm1/messages/d1", map[string]string{"content": "x"})
		if rec.Code != http.StatusForbidden {
			t.Fatalf("status %d, want 403", rec.Code)
		}
	})
}
