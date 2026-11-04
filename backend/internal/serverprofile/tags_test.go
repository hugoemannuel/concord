package serverprofile

import (
	"context"
	"errors"
	"testing"
)

type fakeTagStore struct {
	applied map[string]Tag
	options []TagOption
	err     error
}

func (f *fakeTagStore) ApplyTag(_ context.Context, userID, serverID string) (*Tag, error) {
	if f.err != nil {
		return nil, f.err
	}
	tag := Tag{ServerID: serverID, Name: "ABC"}
	f.applied[userID] = tag
	return &tag, nil
}

func (f *fakeTagStore) ClearTag(_ context.Context, userID string) error {
	delete(f.applied, userID)
	return f.err
}

func (f *fakeTagStore) LookupTags(_ context.Context, ids []string) (map[string]Tag, error) {
	out := map[string]Tag{}
	for _, id := range ids {
		if tag, ok := f.applied[id]; ok {
			out[id] = tag
		}
	}
	return out, f.err
}

func (f *fakeTagStore) TagOptions(context.Context, string) ([]TagOption, error) {
	return f.options, f.err
}

func TestTagsAplicarETirar(t *testing.T) {
	store := &fakeTagStore{applied: map[string]Tag{}}
	pub := &fakePublisher{}
	tags := NewTags(store, pub)
	ctx := context.Background()

	tag, err := tags.Apply(ctx, "ana", "s1")
	if err != nil || tag.ServerID != "s1" {
		t.Fatalf("Apply = %+v, %v", tag, err)
	}
	if len(pub.users) != 1 || pub.users[0].UserID != "ana" || pub.users[0].Tag == nil {
		t.Errorf("evento = %+v", pub.users)
	}

	current, _, err := tags.MyTags(ctx, "ana")
	if err != nil || current == nil || current.ServerID != "s1" {
		t.Errorf("MyTags = %+v, %v", current, err)
	}

	if err := tags.Clear(ctx, "ana"); err != nil {
		t.Fatal(err)
	}
	if last := pub.users[len(pub.users)-1]; last.Tag != nil || last.LeftServerID != "" {
		t.Errorf("evento de tirar = %+v", last)
	}
	current, _, err = tags.MyTags(ctx, "ana")
	if err != nil || current != nil {
		t.Errorf("depois de tirar = %+v, %v", current, err)
	}
}

func TestTagsAplicarRecusado(t *testing.T) {
	store := &fakeTagStore{applied: map[string]Tag{}, err: ErrNotMember}
	pub := &fakePublisher{}
	tags := NewTags(store, pub)
	if _, err := tags.Apply(context.Background(), "ana", "s1"); !errors.Is(err, ErrNotMember) {
		t.Fatalf("erro = %v", err)
	}
	if err := tags.Clear(context.Background(), "ana"); err == nil {
		t.Fatal("quer erro")
	}
	if _, _, err := tags.MyTags(context.Background(), "ana"); err == nil {
		t.Fatal("quer erro")
	}
	if len(pub.users) != 0 {
		t.Errorf("avisou sem gravar: %+v", pub.users)
	}
}

// Saiu, foi expulso ou banido: quem guardou a tag fica sabendo de qual servidor.
func TestTagsMembroSaiu(t *testing.T) {
	pub := &fakePublisher{}
	tags := NewTags(&fakeTagStore{applied: map[string]Tag{}}, pub)
	tags.MemberLeft(context.Background(), "s1", "ana")
	if len(pub.users) != 1 || pub.users[0].LeftServerID != "s1" || pub.users[0].UserID != "ana" || pub.users[0].Tag != nil {
		t.Errorf("evento = %+v", pub.users)
	}
}
