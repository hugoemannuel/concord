package message

import (
	"context"
	"errors"
	"time"
)

// Mensagens favoritas (#590, ADR 0061): a lista pessoal de cada um, com
// mensagens de canal e de DM. Só guarda a referência; o conteúdo é o da
// mensagem, mostrado só enquanto a pessoa ainda lê a sala. Mensagem apagada
// some da lista (a cascata do banco leva o favorito).

// MaxFavoritesPerUser limita quantas mensagens cada pessoa favorita.
const MaxFavoritesPerUser = 500

var ErrFavoritesFull = errors.New("favorite messages limit reached")

// Favorite é um item da lista. Unavailable: a pessoa não lê mais a sala (saiu
// do servidor, perdeu o cargo, saiu do grupo); vai só o id, para poder tirar.
type Favorite struct {
	MessageID   string          `json:"message_id"`
	FavoritedAt time.Time       `json:"favorited_at"`
	Unavailable bool            `json:"unavailable,omitempty"`
	Message     *Message        `json:"message,omitempty"`
	Origin      *FavoriteOrigin `json:"origin,omitempty"`
}

// FavoriteOrigin diz de onde a mensagem é: canal (servidor e nome) ou DM
// (o tipo, o nome do grupo ou a outra pessoa da DM 1:1).
type FavoriteOrigin struct {
	ServerID         string  `json:"server_id,omitempty"`
	ServerName       string  `json:"server_name,omitempty"`
	ChannelName      string  `json:"channel_name,omitempty"`
	ConversationType string  `json:"conversation_type,omitempty"`
	ConversationName string  `json:"conversation_name,omitempty"`
	DMUser           *Author `json:"dm_user,omitempty"`
}

// favoriteStore é o que os favoritos usam do repositório.
type favoriteStore interface {
	FindByID(ctx context.Context, id string) (*Message, error)
	AddFavorite(ctx context.Context, userID, messageID string, max int) error
	RemoveFavorite(ctx context.Context, userID, messageID string) error
	ListFavorites(ctx context.Context, userID string) ([]Favorite, error)
	FindFavorite(ctx context.Context, userID, messageID string) (*Favorite, error)
	FavoriteIDs(ctx context.Context, userID string) ([]string, error)
	// AttachDetails põe as reações e os anexos nas mensagens.
	AttachDetails(ctx context.Context, msgs []Message) error
}

type FavoriteService struct {
	store  favoriteStore
	access RoomAccess
	max    int
}

func NewFavoriteService(store favoriteStore, access RoomAccess) *FavoriteService {
	return &FavoriteService{store: store, access: access, max: MaxFavoritesPerUser}
}

// roomOf: a sala da mensagem (canal ou DM).
func roomOf(msg *Message) Room {
	if msg.ChannelID != nil {
		return Room{ChannelID: *msg.ChannelID}
	}
	if msg.ConversationID != nil {
		return Room{ConversationID: *msg.ConversationID}
	}
	return Room{}
}

// Add favorita uma mensagem que a pessoa lê. Mensagem que não existe ou de
// sala que ela não lê dá ErrMessageNotFound (não conta o que existe).
// Favoritar de novo não muda a ordem.
func (s *FavoriteService) Add(ctx context.Context, userID, messageID string) (*Favorite, error) {
	msg, err := s.store.FindByID(ctx, messageID)
	if err != nil {
		return nil, ErrMessageNotFound
	}
	if err := s.access.CanRead(ctx, roomOf(msg), userID); err != nil {
		return nil, ErrMessageNotFound
	}
	if err := s.store.AddFavorite(ctx, userID, messageID, s.max); err != nil {
		return nil, err
	}
	fav, err := s.store.FindFavorite(ctx, userID, messageID)
	if err != nil {
		return nil, err
	}
	favs := []Favorite{*fav}
	if err := s.reveal(ctx, userID, favs); err != nil {
		return nil, err
	}
	return &favs[0], nil
}

// Remove tira dos favoritos (o que não estava não é erro).
func (s *FavoriteService) Remove(ctx context.Context, userID, messageID string) error {
	return s.store.RemoveFavorite(ctx, userID, messageID)
}

// List: os favoritos, do mais recente ao mais antigo, com o conteúdo só das
// salas que a pessoa ainda lê.
func (s *FavoriteService) List(ctx context.Context, userID string) ([]Favorite, error) {
	favs, err := s.store.ListFavorites(ctx, userID)
	if err != nil {
		return nil, err
	}
	if err := s.reveal(ctx, userID, favs); err != nil {
		return nil, err
	}
	return favs, nil
}

// IDs: só os ids das mensagens favoritas (o menu da mensagem diz "Favoritar"
// ou "Remover das favoritas" sem carregar a lista inteira).
func (s *FavoriteService) IDs(ctx context.Context, userID string) ([]string, error) {
	return s.store.FavoriteIDs(ctx, userID)
}

// reveal confere o acesso (uma vez por sala), esconde o conteúdo das salas
// que a pessoa não lê mais e busca reações e anexos das outras de uma vez.
func (s *FavoriteService) reveal(ctx context.Context, userID string, favs []Favorite) error {
	readable := map[Room]bool{}
	var visible []int
	for i := range favs {
		if s.canRead(ctx, readable, favs[i].Message, userID) {
			visible = append(visible, i)
			continue
		}
		favs[i] = Favorite{MessageID: favs[i].MessageID, FavoritedAt: favs[i].FavoritedAt, Unavailable: true}
	}
	if len(visible) == 0 {
		return nil
	}
	msgs := make([]Message, len(visible))
	for j, i := range visible {
		msgs[j] = *favs[i].Message
	}
	if err := s.store.AttachDetails(ctx, msgs); err != nil {
		return err
	}
	for j, i := range visible {
		favs[i].Message = &msgs[j]
	}
	return nil
}

// canRead: a pessoa lê a sala da mensagem (resposta guardada em readable).
func (s *FavoriteService) canRead(ctx context.Context, readable map[Room]bool, msg *Message, userID string) bool {
	if msg == nil {
		return false
	}
	room := roomOf(msg)
	ok, seen := readable[room]
	if !seen {
		ok = s.access.CanRead(ctx, room, userID) == nil
		readable[room] = ok
	}
	return ok
}
