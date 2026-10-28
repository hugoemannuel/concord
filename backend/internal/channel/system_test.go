package channel

import (
	"context"
	"errors"
	"testing"

	"gin-quickstart/backend/internal/audit"
	"gin-quickstart/backend/internal/permission"
)

// systemStore: canais de sistema ("bot" e "avisos") e um comum em memória.
type systemStore struct {
	fakeStore
	channels map[string]*Channel
	deleted  []string
	updated  []string
}

func (s *systemStore) FindByID(_ context.Context, id string) (*Channel, error) {
	if ch, ok := s.channels[id]; ok {
		c := *ch
		return &c, nil
	}
	return nil, ErrChannelNotFound
}
func (s *systemStore) Update(_ context.Context, id, _ string, _ *audit.Mark) error {
	s.updated = append(s.updated, id)
	return nil
}
func (s *systemStore) Delete(_ context.Context, id string, _ *audit.Mark) error {
	s.deleted = append(s.deleted, id)
	return nil
}
func (s *systemStore) Create(_ context.Context, ch *Channel, _ []permission.Overwrite, _ *audit.Mark) error {
	s.channels[ch.ID] = ch
	return nil
}

func newSystemStore() *systemStore {
	return &systemStore{
		fakeStore: *newFakeStore(),
		channels: map[string]*Channel{
			"bot":    {ID: "bot", ServerID: "s1", Name: SystemChannelName, Type: TypeText, IsSystem: true},
			"avisos": {ID: "avisos", ServerID: "s1", Name: NoticesChannelName, Type: TypeText, IsSystem: true},
			"geral":  {ID: "geral", ServerID: "s1", Name: "geral", Type: TypeText},
		},
	}
}

func TestSystemChannelCannotBeChanged(t *testing.T) {
	store := newSystemStore()
	svc := newService(store, nil)
	ctx := context.Background()

	for _, id := range []string{"bot", "avisos"} {
		if _, err := svc.Update(ctx, id, "outro", "dono"); !errors.Is(err, ErrSystemChannel) {
			t.Fatalf("%s: Update err = %v, want ErrSystemChannel", id, err)
		}
		if err := svc.Delete(ctx, id, "dono"); !errors.Is(err, ErrSystemChannel) {
			t.Fatalf("%s: Delete err = %v, want ErrSystemChannel", id, err)
		}
		ch := store.channels[id]
		if err := svc.SetOverwrite(ctx, ch, permission.Overwrite{}, "dono"); !errors.Is(err, ErrSystemChannel) {
			t.Fatalf("%s: SetOverwrite err = %v, want ErrSystemChannel", id, err)
		}
		if err := svc.DeleteOverwrite(ctx, ch, "role", "x", "dono"); !errors.Is(err, ErrSystemChannel) {
			t.Fatalf("%s: DeleteOverwrite err = %v, want ErrSystemChannel", id, err)
		}
	}
	if len(store.updated)+len(store.deleted) != 0 {
		t.Fatalf("system channel was touched: updated=%v deleted=%v", store.updated, store.deleted)
	}
}

func TestRegularChannelStillEditable(t *testing.T) {
	store := newSystemStore()
	svc := newService(store, nil)
	ctx := context.Background()

	if _, err := svc.Update(ctx, "geral", "novo", "dono"); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if err := svc.Delete(ctx, "geral", "dono"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
}

func TestCreateNeverMakesSystemChannel(t *testing.T) {
	store := newSystemStore()
	svc := newService(store, nil)

	ch := &Channel{ServerID: "s1", Name: "x", IsSystem: true}
	if err := svc.Create(context.Background(), ch); err != nil {
		t.Fatal(err)
	}
	if ch.IsSystem {
		t.Fatal("Create must ignore is_system")
	}

	sys, err := svc.CreateSystem(context.Background(), "s1", "dono")
	if err != nil {
		t.Fatal(err)
	}
	if !sys.IsSystem || sys.Name != SystemChannelName || sys.Type != TypeText {
		t.Fatalf("CreateSystem = %+v", sys)
	}

	notices, err := svc.CreateNotices(context.Background(), "s1", "dono")
	if err != nil {
		t.Fatal(err)
	}
	if !notices.IsSystem || notices.Name != NoticesChannelName || notices.Type != TypeText {
		t.Fatalf("CreateNotices = %+v", notices)
	}
}
