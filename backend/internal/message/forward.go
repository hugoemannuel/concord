package message

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log"
	"os"
	"strings"
	"unicode/utf8"

	"github.com/google/uuid"
)

// Encaminhar uma mensagem para outro canal, servidor ou DM (como no Discord).
// A mensagem nova é de quem encaminhou, com o texto, a figurinha, o GIF e uma
// cópia dos arquivos da original, e guarda a origem em forwarded_from
// (docs/adr/0062-encaminhar-mensagens.md). Não pinga ninguém. O comentário
// opcional vai logo depois, como uma mensagem comum.

var (
	ErrNotForwardable       = errors.New("this message cannot be forwarded")
	ErrInvalidForwardTarget = errors.New("choose one channel or conversation to forward to")
	ErrForwardNoSpace       = errors.New("server out of space")
)

type ForwardRequest struct {
	Origin    Room
	MessageID string
	UserID    string
	Target    Room
	// Comentário opcional, enviado como uma mensagem comum depois.
	Comment string
}

type ForwardResult struct {
	Message *Message `json:"message"`
	Comment *Message `json:"comment,omitempty"`
}

// ForwardOrigin: os nomes do canal de origem (a foto que vai em forwarded_from).
type ForwardOrigin struct {
	ChannelName string
	ServerID    string
	ServerName  string
}

// ForwardDirectory acha os nomes do canal de origem (ligado em cmd/).
type ForwardDirectory interface {
	ChannelOrigin(ctx context.Context, channelID string) (ForwardOrigin, error)
}

type forwardStore interface {
	FindByID(ctx context.Context, id string) (*Message, error)
	FindNewByID(ctx context.Context, id string) (*Message, error)
	HasPoll(ctx context.Context, messageID string) (bool, error)
	AttachAttachments(ctx context.Context, messages []Message) error
	CreateForwarded(ctx context.Context, msg *Message, attachments []storedAttachment) error
}

// forwardFiles: o disco dos anexos (media.Store).
type forwardFiles interface {
	Open(id string) (*os.File, error)
	Save(id string, r io.Reader, limit int64) (int64, []byte, error)
	Remove(name string) error
}

// commentSender envia o comentário pelo caminho de sempre (Service).
type commentSender interface {
	CreateChannelMessage(ctx context.Context, channelID string, authorID string, content string, replyToID *string, attachmentIDs []string, stickerID *string, gifURL *string, gifMetadata *GifMetadata) (*Message, error)
	CreateConversationMessage(ctx context.Context, conversationID string, authorID string, content string, replyToID *string, attachmentIDs []string, stickerID *string, gifURL *string, gifMetadata *GifMetadata) (*Message, error)
}

type ForwarderDeps struct {
	Store     forwardStore
	Files     forwardFiles
	Space     spaceChecker
	Rooms     *ForwardRooms
	Directory ForwardDirectory
	Comments  commentSender
	Events    *RoomEvents
	// Slowmode: o modo lento dos canais (nil = sem modo lento).
	Slowmode *Slowmode
}

type Forwarder struct {
	store     forwardStore
	files     forwardFiles
	space     spaceChecker
	rooms     *ForwardRooms
	directory ForwardDirectory
	comments  commentSender
	events    *RoomEvents
	slowmode  *Slowmode
}

func NewForwarder(d ForwarderDeps) *Forwarder {
	return &Forwarder{store: d.Store, files: d.Files, space: d.Space, rooms: d.Rooms, directory: d.Directory, comments: d.Comments, events: d.Events, slowmode: d.Slowmode}
}

// Forward copia a mensagem para o destino e publica. Recusa o que não sabe
// copiar (enquete, convite para call, mensagem do sistema).
func (f *Forwarder) Forward(ctx context.Context, req ForwardRequest) (*ForwardResult, error) {
	if err := validateForwardRequest(req); err != nil {
		return nil, err
	}
	src, err := f.source(ctx, req)
	if err != nil {
		return nil, err
	}
	if err := f.rooms.CanSend(ctx, req.Target, req.UserID, len(src.Attachments) > 0); err != nil {
		return nil, err
	}
	msg, turn, err := f.copyInTurn(ctx, req, src)
	if err != nil {
		return nil, err
	}
	f.events.Created(ctx, msg)
	return &ForwardResult{Message: msg, Comment: f.comment(ctx, req, turn)}, nil
}

func validateForwardRequest(req ForwardRequest) error {
	if (req.Target.ChannelID == "") == (req.Target.ConversationID == "") {
		return ErrInvalidForwardTarget
	}
	if utf8.RuneCountInString(req.Comment) > MaxMessageLength {
		return ErrContentTooLong
	}
	return nil
}

// source: a mensagem da origem, que a pessoa lê e que dá para copiar, com os anexos.
func (f *Forwarder) source(ctx context.Context, req ForwardRequest) (*Message, error) {
	if err := f.rooms.CanRead(ctx, req.Origin, req.UserID); err != nil {
		return nil, err
	}
	src, err := f.store.FindByID(ctx, req.MessageID)
	if err != nil || !SameRoomTarget(src, req.Origin.ChannelID, req.Origin.ConversationID) {
		return nil, ErrMessageNotFound
	}
	if err := f.checkForwardable(ctx, src); err != nil {
		return nil, err
	}
	page := []Message{*src}
	if err := f.store.AttachAttachments(ctx, page); err != nil {
		return nil, err
	}
	// a visualização única só aparece depois de AttachAttachments (FindByID não
	// lê view_once): checar antes deixaria a legenda passar.
	if page[0].ViewOnce != nil || !hasForwardableContent(&page[0]) {
		return nil, ErrNotForwardable
	}
	return &page[0], nil
}

func (f *Forwarder) checkForwardable(ctx context.Context, src *Message) error {
	if src.SystemKind != nil || src.CallInvite != nil {
		return ErrNotForwardable
	}
	hasPoll, err := f.store.HasPoll(ctx, src.ID)
	if err != nil {
		return err
	}
	if hasPoll {
		return ErrNotForwardable
	}
	return nil
}

func hasForwardableContent(m *Message) bool {
	return strings.TrimSpace(m.Content) != "" || len(m.Attachments) > 0 || m.StickerID != nil ||
		m.GifURL != nil || m.DeletedStickerName != nil
}

// copy grava a mensagem nova com a cópia dos arquivos; se o banco falhar, as
// cópias saem do disco.
func (f *Forwarder) copy(ctx context.Context, req ForwardRequest, src *Message) (*Message, error) {
	msg := &Message{
		ID:                 uuid.NewString(),
		AuthorID:           req.UserID,
		ChannelID:          nilIfEmpty(req.Target.ChannelID),
		ConversationID:     nilIfEmpty(req.Target.ConversationID),
		Content:            src.Content,
		StickerID:          src.StickerID,
		DeletedStickerName: src.DeletedStickerName,
		GifURL:             src.GifURL,
		GifMetadata:        src.GifMetadata,
		EmbedsSuppressed:   src.EmbedsSuppressed,
		ForwardedFrom:      f.origin(ctx, src),
	}
	atts, err := f.copyFiles(src.Attachments, req)
	if err != nil {
		return nil, err
	}
	if err := f.store.CreateForwarded(ctx, msg, atts); err != nil {
		f.removeFiles(atts)
		return nil, err
	}
	return f.reload(ctx, msg.ID)
}

// origin: de onde a mensagem veio. Encaminhada de novo, vale a origem primeira.
func (f *Forwarder) origin(ctx context.Context, src *Message) *ForwardedFrom {
	if src.ForwardedFrom != nil {
		return src.ForwardedFrom
	}
	ff := &ForwardedFrom{MessageID: src.ID, AuthorID: src.AuthorID, CreatedAt: src.CreatedAt}
	if src.Author != nil {
		ff.AuthorName, ff.AuthorUsername = src.Author.DisplayName, src.Author.Username
	}
	if src.ConversationID != nil {
		ff.ConversationID = src.ConversationID
		return ff
	}
	ff.ChannelID = src.ChannelID
	if names, err := f.directory.ChannelOrigin(ctx, *src.ChannelID); err == nil {
		ff.ChannelName, ff.ServerName = names.ChannelName, names.ServerName
		ff.ServerID = nilIfEmpty(names.ServerID)
	}
	return ff
}

// copyFiles copia cada arquivo da original para um id novo, já na sala de destino.
func (f *Forwarder) copyFiles(src []Attachment, req ForwardRequest) ([]storedAttachment, error) {
	if len(src) == 0 {
		return nil, nil
	}
	var total int64
	for _, a := range src {
		total += a.SizeBytes
	}
	if !f.space.HasRoom(total) {
		return nil, ErrForwardNoSpace
	}
	out := make([]storedAttachment, 0, len(src))
	for _, a := range src {
		copied, err := f.copyFile(a, req)
		if err != nil {
			f.removeFiles(out)
			return nil, err
		}
		out = append(out, copied)
	}
	return out, nil
}

func (f *Forwarder) copyFile(a Attachment, req ForwardRequest) (storedAttachment, error) {
	copied := *newStoredAttachment(req.UserID, req.Target)
	id := copied.ID
	copied.Attachment = a
	copied.ID = id
	in, err := f.files.Open(a.ID)
	if err != nil {
		return storedAttachment{}, fmt.Errorf("abrir anexo %s: %w", a.ID, err)
	}
	defer in.Close()
	if _, _, err := f.files.Save(id, in, a.SizeBytes); err != nil {
		return storedAttachment{}, fmt.Errorf("copiar anexo %s: %w", a.ID, err)
	}
	return copied, nil
}

func (f *Forwarder) removeFiles(atts []storedAttachment) {
	for _, a := range atts {
		if err := f.files.Remove(a.ID); err != nil {
			log.Printf("[message] apagar cópia %s: %v", a.ID, err)
		}
	}
}

func (f *Forwarder) reload(ctx context.Context, id string) (*Message, error) {
	full, err := f.store.FindNewByID(ctx, id)
	if err != nil {
		return nil, err
	}
	page := []Message{*full}
	if err := f.store.AttachAttachments(ctx, page); err != nil {
		return nil, err
	}
	return &page[0], nil
}

// comment envia o comentário depois da encaminhada. Se ele falhar, o
// encaminhamento fica (já foi publicado) e o app mostra só ele. No canal, ele
// sai na vez do modo lento que o encaminhamento já marcou (turn).
func (f *Forwarder) comment(ctx context.Context, req ForwardRequest, turn slowTurn) *Message {
	text := strings.TrimSpace(req.Comment)
	if text == "" {
		return nil
	}
	var msg *Message
	var err error
	if req.Target.ChannelID != "" {
		msg, err = turn.lendTo(ctx, func() (*Message, error) {
			return f.comments.CreateChannelMessage(ctx, req.Target.ChannelID, req.UserID, text, nil, nil, nil, nil, nil)
		})
	} else {
		msg, err = f.comments.CreateConversationMessage(ctx, req.Target.ConversationID, req.UserID, text, nil, nil, nil, nil, nil)
	}
	if err != nil {
		log.Printf("[message] comentário do encaminhamento: %v", err)
		return nil
	}
	return msg
}
