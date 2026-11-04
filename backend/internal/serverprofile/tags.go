package serverprofile

import "context"

// TagStore é o que as tags usam do banco.
type TagStore interface {
	// ApplyTag: ErrNotMember fora do servidor; ErrNoTag se ele não tem tag.
	ApplyTag(ctx context.Context, userID, serverID string) (*Tag, error)
	ClearTag(ctx context.Context, userID string) error
	LookupTags(ctx context.Context, userIDs []string) (map[string]Tag, error)
	TagOptions(ctx context.Context, userID string) ([]TagOption, error)
}

// Tags é a escolha de cada pessoa: uma tag de um servidor em que ela está.
type Tags struct {
	store     TagStore
	publisher Publisher
}

func NewTags(store TagStore, publisher Publisher) *Tags {
	return &Tags{store: store, publisher: publisher}
}

// Lookup: a tag de cada id que usa uma (os outros ficam fora do mapa).
func (t *Tags) Lookup(ctx context.Context, userIDs []string) (map[string]Tag, error) {
	return t.store.LookupTags(ctx, userIDs)
}

// MyTags: a tag em uso (nil = nenhuma) e as que a pessoa pode usar.
func (t *Tags) MyTags(ctx context.Context, userID string) (*Tag, []TagOption, error) {
	current, err := t.store.LookupTags(ctx, []string{userID})
	if err != nil {
		return nil, nil, err
	}
	options, err := t.store.TagOptions(ctx, userID)
	if err != nil {
		return nil, nil, err
	}
	tag, ok := current[userID]
	if !ok {
		return nil, options, nil
	}
	return &tag, options, nil
}

// Apply passa a usar a tag do servidor (troca a anterior, se houver).
func (t *Tags) Apply(ctx context.Context, userID, serverID string) (*Tag, error) {
	tag, err := t.store.ApplyTag(ctx, userID, serverID)
	if err != nil {
		return nil, err
	}
	t.publisher.PublishUserServerTag(UserTagEvent{UserID: userID, Tag: tag})
	return tag, nil
}

// Clear deixa de usar a tag.
func (t *Tags) Clear(ctx context.Context, userID string) error {
	if err := t.store.ClearTag(ctx, userID); err != nil {
		return err
	}
	t.publisher.PublishUserServerTag(UserTagEvent{UserID: userID})
	return nil
}

// MemberLeft avisa que a pessoa saiu, foi expulsa ou banida: o banco já tirou a
// tag dela (a chave para server_members) e só falta quem a tem guardada saber.
func (t *Tags) MemberLeft(_ context.Context, serverID, userID string) {
	t.publisher.PublishUserServerTag(UserTagEvent{UserID: userID, LeftServerID: serverID})
}
