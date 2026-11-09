package channel

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"gin-quickstart/backend/internal/permission"
)

// systemStore: canais de sistema ("musica" e "avisos") e um comum em memória.
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
func (s *systemStore) Update(_ context.Context, id string, _ UpdateInput) error {
	s.updated = append(s.updated, id)
	return nil
}
func (s *systemStore) Delete(_ context.Context, id string) error {
	s.deleted = append(s.deleted, id)
	return nil
}
func (s *systemStore) Create(_ context.Context, ch *Channel, _ []permission.Overwrite) error {
	s.channels[ch.ID] = ch
	return nil
}

func newSystemStore() *systemStore {
	return &systemStore{
		fakeStore: *newFakeStore(),
		channels: map[string]*Channel{
			"musica": {ID: "musica", ServerID: "s1", Name: SystemChannelName, Type: TypeText, IsSystem: true},
			"avisos": {ID: "avisos", ServerID: "s1", Name: NoticesChannelName, Type: TypeText, IsSystem: true},
			"geral":  {ID: "geral", ServerID: "s1", Name: "geral", Type: TypeText},
		},
	}
}

func TestSystemChannelCannotBeChanged(t *testing.T) {
	store := newSystemStore()
	svc := newService(store, nil)
	ctx := context.Background()

	for _, id := range []string{"musica", "avisos"} {
		if _, err := svc.Update(ctx, id, UpdateInput{Name: "outro"}); !errors.Is(err, ErrSystemChannel) {
			t.Fatalf("%s: Update err = %v, want ErrSystemChannel", id, err)
		}
		if err := svc.Delete(ctx, id); !errors.Is(err, ErrSystemChannel) {
			t.Fatalf("%s: Delete err = %v, want ErrSystemChannel", id, err)
		}
		ch := store.channels[id]
		if err := svc.SetOverwrite(ctx, ch, permission.Overwrite{}); !errors.Is(err, ErrSystemChannel) {
			t.Fatalf("%s: SetOverwrite err = %v, want ErrSystemChannel", id, err)
		}
		if err := svc.DeleteOverwrite(ctx, ch, "role", "x"); !errors.Is(err, ErrSystemChannel) {
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

	if _, err := svc.Update(ctx, "geral", UpdateInput{Name: "novo"}); err != nil {
		t.Fatalf("Update: %v", err)
	}
	if err := svc.Delete(ctx, "geral"); err != nil {
		t.Fatalf("Delete: %v", err)
	}
}

func TestCreateNeverMakesSystemChannel(t *testing.T) {
	store := newSystemStore()
	svc := newService(store, nil)

	kind := SystemKindMaestro
	ch := &Channel{ServerID: "s1", Name: "x", IsSystem: true, SystemKind: &kind}
	if err := svc.Create(context.Background(), ch); err != nil {
		t.Fatal(err)
	}
	if ch.IsSystem || ch.SystemKind != nil {
		t.Fatal("Create must ignore is_system e system_kind")
	}

	sys, err := svc.CreateSystem(context.Background(), "s1", "dono")
	if err != nil {
		t.Fatal(err)
	}
	if !sys.IsSystem || sys.Name != SystemChannelName || sys.Type != TypeText || kindOf(sys) != SystemKindMaestro {
		t.Fatalf("CreateSystem = %+v", sys)
	}

	notices, err := svc.CreateNotices(context.Background(), "s1", "dono")
	if err != nil {
		t.Fatal(err)
	}
	if !notices.IsSystem || notices.Name != NoticesChannelName || notices.Type != TypeText || kindOf(notices) != SystemKindNotices {
		t.Fatalf("CreateNotices = %+v", notices)
	}
}

func kindOf(ch *Channel) string {
	if ch.SystemKind == nil {
		return ""
	}
	return *ch.SystemKind
}

// O JSON do canal leva o tipo: os apps reconhecem o canal do Maestro por ele.
func TestChannelJSONHasSystemKind(t *testing.T) {
	svc := newService(newSystemStore(), nil)
	sys, err := svc.CreateSystem(context.Background(), "s3", "dono")
	if err != nil {
		t.Fatal(err)
	}
	for ch, want := range map[*Channel]string{sys: `"system_kind":"maestro"`, {Name: "geral"}: `"system_kind":null`} {
		data, err := json.Marshal(ch)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), want) {
			t.Errorf("JSON = %s, want %s", data, want)
		}
	}
}
