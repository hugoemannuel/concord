package event

import (
	"context"
	"errors"
	"log"
	"strings"
	"time"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
)

// maxSlug: tamanho máximo do nome do canal sem o prefixo e o sufixo.
const maxSlug = 60

// RoomRequest é o que o agendador sabe de um evento que precisa de sala.
type RoomRequest struct {
	EventID    string
	ServerID   string
	Title      string
	Occurrence time.Time
	CreatedBy  *string
}

// RoomRef são os canais da sala de um evento que vai fechar.
type RoomRef struct {
	EventID  string
	ServerID string
	VoiceID  *string
	TextID   *string
}

// channelMaker é o que as salas usam do channel.Service.
type channelMaker interface {
	Create(ctx context.Context, ch *channel.Channel, overwrites ...permission.Overwrite) error
	Delete(ctx context.Context, id string) error
	FindByID(ctx context.Context, id string) (*channel.Channel, error)
	SetOverwrite(ctx context.Context, ch *channel.Channel, o permission.Overwrite) error
	DeleteOverwrite(ctx context.Context, ch *channel.Channel, targetType, targetID string) error
}

type snapshotSource interface {
	Snapshot(ctx context.Context, serverID string) (*permission.Snapshot, error)
}

// callCloser derruba a chamada de voz do canal antes de ele ser apagado.
type callCloser interface {
	CloseChannelCall(ctx context.Context, serverID, channelID string)
}

// roomStore guarda no evento os canais da sala.
type roomStore interface {
	SetRoom(ctx context.Context, eventID, voiceID, textID string) error
}

// Rooms abre e fecha a sala própria de um evento: um canal de voz e um de
// texto, privados, só para quem confirmou presença (e o organizador).
type Rooms struct {
	channels channelMaker
	snaps    snapshotSource
	calls    callCloser
	store    roomStore
}

func NewRooms(channels channelMaker, snaps snapshotSource, calls callCloser, store roomStore) *Rooms {
	return &Rooms{channels: channels, snaps: snaps, calls: calls, store: store}
}

// Open cria os dois canais já fechados (o @everyone não vê; quem confirmou e o
// organizador veem) e grava os ids no evento. Falha no meio desfaz o que criou.
func (r *Rooms) Open(ctx context.Context, req RoomRequest, going []string) error {
	snap, err := r.snaps.Snapshot(ctx, req.ServerID)
	if err != nil {
		return err
	}
	allowed := allowedUsers(going, req.CreatedBy)
	base := "evento-" + slug(req.Title)
	voice, err := r.create(ctx, req, base, channel.TypeVoice, roomOverwrites(snap.Everyone.ID, channel.TypeVoice, allowed))
	if err != nil {
		return err
	}
	text, err := r.create(ctx, req, base+"-chat", channel.TypeText, roomOverwrites(snap.Everyone.ID, channel.TypeText, allowed))
	if err != nil {
		r.discard(ctx, voice.ID)
		return err
	}
	if err := r.store.SetRoom(ctx, req.EventID, voice.ID, text.ID); err != nil {
		r.discard(ctx, voice.ID)
		r.discard(ctx, text.ID)
		return err
	}
	return nil
}

// create cria um canal da sala; nome repetido no servidor tenta de novo com
// um pedaço do id do evento no fim.
func (r *Rooms) create(ctx context.Context, req RoomRequest, name, chType string, overwrites []permission.Overwrite) (*channel.Channel, error) {
	ch := &channel.Channel{ServerID: req.ServerID, Name: name, Type: chType, CreatedBy: creatorOf(req), Managed: true}
	if err := r.channels.Create(ctx, ch, overwrites...); err == nil {
		return ch, nil
	}
	ch = &channel.Channel{ServerID: req.ServerID, Name: name + "-" + shortID(req.EventID), Type: chType, CreatedBy: creatorOf(req), Managed: true}
	if err := r.channels.Create(ctx, ch, overwrites...); err != nil {
		return nil, err
	}
	return ch, nil
}

func creatorOf(req RoomRequest) string {
	if req.CreatedBy != nil {
		return *req.CreatedBy
	}
	return ""
}

func shortID(id string) string {
	return strings.ReplaceAll(id, "-", "")[:4]
}

func (r *Rooms) discard(ctx context.Context, channelID string) {
	if err := r.channels.Delete(ctx, channelID); err != nil {
		log.Printf("[eventos] desfazer canal %s: %v", channelID, err)
	}
}

// Close derruba a chamada e apaga os dois canais (com o histórico do chat).
// Canal que já não existe não é erro.
func (r *Rooms) Close(ctx context.Context, ref RoomRef) error {
	var first error
	keep := func(err error) {
		if err != nil && !errors.Is(err, channel.ErrChannelNotFound) && first == nil {
			first = err
		}
	}
	if ref.VoiceID != nil {
		r.calls.CloseChannelCall(ctx, ref.ServerID, *ref.VoiceID)
		keep(r.channels.Delete(ctx, *ref.VoiceID))
	}
	if ref.TextID != nil {
		keep(r.channels.Delete(ctx, *ref.TextID))
	}
	return first
}

// Allow libera ou tira o acesso de uma pessoa à sala aberta (quem confirmou
// ou desistiu depois da sala abrir). O organizador nunca perde o acesso. Sem
// sala aberta, não faz nada.
func (r *Rooms) Allow(ctx context.Context, e *Event, userID string, allowed bool) {
	if !allowed && e.CreatedBy != nil && *e.CreatedBy == userID {
		return
	}
	for _, id := range []*string{e.VoiceChannelID, e.TextChannelID} {
		if id != nil {
			r.allowIn(ctx, *id, userID, allowed)
		}
	}
}

func (r *Rooms) allowIn(ctx context.Context, channelID, userID string, allowed bool) {
	ch, err := r.channels.FindByID(ctx, channelID)
	if err != nil {
		log.Printf("[eventos] canal %s da sala: %v", channelID, err)
		return
	}
	if allowed {
		err = r.channels.SetOverwrite(ctx, ch, memberAccess(ch.Type, userID))
	} else {
		err = r.channels.DeleteOverwrite(ctx, ch, permission.TargetMember, userID)
	}
	if err != nil {
		log.Printf("[eventos] acesso de %s ao canal %s: %v", userID, channelID, err)
	}
}

// allowedUsers: quem confirmou e o organizador, sem repetir.
func allowedUsers(going []string, creator *string) []string {
	seen := make(map[string]bool, len(going)+1)
	out := make([]string, 0, len(going)+1)
	for _, id := range append(append([]string{}, going...), derefOr(creator)) {
		if id != "" && !seen[id] {
			seen[id] = true
			out = append(out, id)
		}
	}
	return out
}

func derefOr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// roomOverwrites: o @everyone não vê o canal; cada pessoa liberada vê (e, na
// voz, conecta). O resto das permissões vem dos cargos, como em qualquer canal.
func roomOverwrites(everyoneID, chType string, users []string) []permission.Overwrite {
	list := []permission.Overwrite{{
		TargetType: permission.TargetRole,
		TargetID:   everyoneID,
		Deny:       permission.ViewChannel,
	}}
	for _, id := range users {
		list = append(list, memberAccess(chType, id))
	}
	return list
}

func memberAccess(chType, userID string) permission.Overwrite {
	access := permission.ViewChannel
	if chType == channel.TypeVoice {
		access |= permission.Connect
	}
	return permission.Overwrite{TargetType: permission.TargetMember, TargetID: userID, Allow: access}
}

// accents tira os acentos do português para o nome do canal.
var accents = strings.NewReplacer(
	"á", "a", "à", "a", "â", "a", "ã", "a", "ä", "a",
	"é", "e", "è", "e", "ê", "e", "ë", "e",
	"í", "i", "ì", "i", "î", "i", "ï", "i",
	"ó", "o", "ò", "o", "ô", "o", "õ", "o", "ö", "o",
	"ú", "u", "ù", "u", "û", "u", "ü", "u",
	"ç", "c", "ñ", "n",
)

// slug: o título como nome de canal (minúsculas, letras e números separados
// por "-", até 60 caracteres). Título sem letras nem números vira "evento".
func slug(title string) string {
	var b strings.Builder
	dash := false
	for _, c := range accents.Replace(strings.ToLower(title)) {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') {
			if dash && b.Len() > 0 {
				b.WriteByte('-')
			}
			b.WriteRune(c)
			dash = false
			continue
		}
		dash = true
	}
	out := b.String()
	if len(out) > maxSlug {
		out = strings.TrimRight(out[:maxSlug], "-")
	}
	if out == "" {
		return "evento"
	}
	return out
}
