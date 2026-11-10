package message

import (
	"context"
	"errors"
	"testing"
)

// fakeFavoriteStore: os favoritos de cada pessoa em memória, na ordem da lista.
type fakeFavoriteStore struct {
	messages map[string]*Message
	favs     map[string][]string
	full     bool
	details  int
}

func newFakeFavoriteStore(msgs ...*Message) *fakeFavoriteStore {
	s := &fakeFavoriteStore{messages: map[string]*Message{}, favs: map[string][]string{}}
	for _, m := range msgs {
		s.messages[m.ID] = m
	}
	return s
}

func (s *fakeFavoriteStore) FindByID(_ context.Context, id string) (*Message, error) {
	if m, ok := s.messages[id]; ok {
		cp := *m
		return &cp, nil
	}
	return nil, errors.New("no rows")
}

func (s *fakeFavoriteStore) AddFavorite(_ context.Context, userID, messageID string, _ int) error {
	if s.full {
		return ErrFavoritesFull
	}
	s.favs[userID] = append([]string{messageID}, s.favs[userID]...)
	return nil
}

func (s *fakeFavoriteStore) RemoveFavorite(_ context.Context, userID, messageID string) error {
	kept := []string{}
	for _, id := range s.favs[userID] {
		if id != messageID {
			kept = append(kept, id)
		}
	}
	s.favs[userID] = kept
	return nil
}

func (s *fakeFavoriteStore) favorite(id string) Favorite {
	cp := *s.messages[id]
	return Favorite{MessageID: id, Message: &cp, Origin: &FavoriteOrigin{ChannelName: "geral"}}
}

func (s *fakeFavoriteStore) ListFavorites(_ context.Context, userID string) ([]Favorite, error) {
	out := []Favorite{}
	for _, id := range s.favs[userID] {
		out = append(out, s.favorite(id))
	}
	return out, nil
}

func (s *fakeFavoriteStore) FindFavorite(_ context.Context, userID, messageID string) (*Favorite, error) {
	for _, id := range s.favs[userID] {
		if id == messageID {
			fav := s.favorite(id)
			return &fav, nil
		}
	}
	return nil, ErrMessageNotFound
}

func (s *fakeFavoriteStore) FavoriteIDs(_ context.Context, userID string) ([]string, error) {
	return append([]string{}, s.favs[userID]...), nil
}

func (s *fakeFavoriteStore) AttachDetails(_ context.Context, msgs []Message) error {
	s.details++
	for i := range msgs {
		msgs[i].Reactions = []ReactionSummary{{Emoji: "👍", Count: 1}}
	}
	return nil
}

// readRooms: lê quem está em allowed[sala]; conta as conferências.
type readRooms struct {
	allowed map[Room][]string
	checks  int
}

func (a *readRooms) CanRead(_ context.Context, room Room, userID string) error {
	a.checks++
	for _, id := range a.allowed[room] {
		if id == userID {
			return nil
		}
	}
	return ErrNoRoomAccess
}

func (a *readRooms) CanWrite(ctx context.Context, room Room, userID string) error {
	return a.CanRead(ctx, room, userID)
}

func favStr(s string) *string { return &s }

func favChannelMsg(id, channelID string) *Message {
	return &Message{ID: id, ChannelID: favStr(channelID), Content: "oi " + id}
}

func favDMMsg(id, convID string) *Message {
	return &Message{ID: id, ConversationID: favStr(convID), Content: "dm " + id}
}

func TestFavoritarMensagemDeCanalQueLe(t *testing.T) {
	store := newFakeFavoriteStore(favChannelMsg("m1", "c1"))
	access := &readRooms{allowed: map[Room][]string{{ChannelID: "c1"}: {"ana"}}}
	svc := NewFavoriteService(store, access)

	fav, err := svc.Add(context.Background(), "ana", "m1")
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	if fav.MessageID != "m1" || fav.Message == nil || fav.Unavailable {
		t.Fatalf("favorito = %+v, quer a mensagem m1 visível", fav)
	}
	if len(fav.Message.Reactions) != 1 {
		t.Errorf("reações = %v, quer os detalhes da mensagem", fav.Message.Reactions)
	}
}

func TestFavoritarSemAcessoOuInexistenteDaNaoEncontrada(t *testing.T) {
	store := newFakeFavoriteStore(favChannelMsg("m1", "c1"), favDMMsg("d1", "cv1"))
	access := &readRooms{allowed: map[Room][]string{{ChannelID: "c1"}: {"ana"}}}
	svc := NewFavoriteService(store, access)

	for _, id := range []string{"d1", "sumiu"} {
		if _, err := svc.Add(context.Background(), "ana", id); !errors.Is(err, ErrMessageNotFound) {
			t.Errorf("Add(%s) = %v, quer ErrMessageNotFound (não vaza o que existe)", id, err)
		}
	}
	if ids, _ := store.FavoriteIDs(context.Background(), "ana"); len(ids) != 0 {
		t.Errorf("favoritos = %v, quer nenhum", ids)
	}
}

func TestFavoritarAlemDoLimiteDaErrFavoritesFull(t *testing.T) {
	store := newFakeFavoriteStore(favChannelMsg("m1", "c1"))
	store.full = true
	access := &readRooms{allowed: map[Room][]string{{ChannelID: "c1"}: {"ana"}}}

	_, err := NewFavoriteService(store, access).Add(context.Background(), "ana", "m1")
	if !errors.Is(err, ErrFavoritesFull) {
		t.Fatalf("Add = %v, quer ErrFavoritesFull", err)
	}
}

func TestListaEscondeConteudoDeSalaQueNaoLeMais(t *testing.T) {
	store := newFakeFavoriteStore(favChannelMsg("m1", "c1"), favChannelMsg("m2", "c2"), favDMMsg("d1", "cv1"), favChannelMsg("m3", "c1"))
	store.favs["ana"] = []string{"m1", "m2", "d1", "m3"}
	access := &readRooms{allowed: map[Room][]string{
		{ChannelID: "c1"}:       {"ana"},
		{ConversationID: "cv1"}: {"ana"},
	}}

	favs, err := NewFavoriteService(store, access).List(context.Background(), "ana")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(favs) != 4 {
		t.Fatalf("favoritos = %d, quer 4 (o indisponível continua, para poder tirar)", len(favs))
	}
	lost := favs[1]
	if !lost.Unavailable || lost.Message != nil || lost.Origin != nil || lost.MessageID != "m2" {
		t.Errorf("favorito sem acesso = %+v, quer só o id e unavailable", lost)
	}
	for _, i := range []int{0, 2, 3} {
		if favs[i].Unavailable || favs[i].Message == nil || len(favs[i].Message.Reactions) != 1 {
			t.Errorf("favorito %d = %+v, quer visível e com detalhes", i, favs[i])
		}
	}
	if access.checks != 3 {
		t.Errorf("conferências de acesso = %d, quer 3 (uma por sala)", access.checks)
	}
	if store.details != 1 {
		t.Errorf("buscas de detalhes = %d, quer 1 (todas juntas)", store.details)
	}
}

func TestListaVaziaNaoBuscaDetalhes(t *testing.T) {
	store := newFakeFavoriteStore()
	favs, err := NewFavoriteService(store, &readRooms{}).List(context.Background(), "ana")
	if err != nil || len(favs) != 0 {
		t.Fatalf("List = %v, %v; quer lista vazia", favs, err)
	}
	if store.details != 0 {
		t.Errorf("buscas de detalhes = %d, quer 0", store.details)
	}
}

func TestDesfavoritarTiraDaLista(t *testing.T) {
	store := newFakeFavoriteStore(favChannelMsg("m1", "c1"))
	store.favs["ana"] = []string{"m1"}
	svc := NewFavoriteService(store, &readRooms{})

	if err := svc.Remove(context.Background(), "ana", "m1"); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	if ids, _ := svc.IDs(context.Background(), "ana"); len(ids) != 0 {
		t.Errorf("ids = %v, quer nenhum", ids)
	}
}
