package alert

import (
	"context"
	"errors"
	"testing"
)

type fakeChannels struct {
	channels   map[ChannelKind]string
	categories map[string]string
	created    []string
	fail       error
}

func (f *fakeChannels) SystemChannelID(_ context.Context, _ string, kind ChannelKind) (string, error) {
	return f.channels[kind], f.fail
}
func (f *fakeChannels) CategoryID(_ context.Context, _ string, name string) (string, error) {
	return f.categories[name], nil
}
func (f *fakeChannels) CreateCategory(_ context.Context, _ string, name string) (string, error) {
	f.categories[name] = "cat-nova"
	f.created = append(f.created, "categoria "+name)
	return "cat-nova", nil
}
func (f *fakeChannels) CreateChannel(_ context.Context, _ string, category, name string, kind ChannelKind) (string, error) {
	f.channels[kind] = "c-" + name
	f.created = append(f.created, name+" em "+category)
	return "c-" + name, nil
}

func TestEnsureChannelsCriaSoOQueFalta(t *testing.T) {
	store := &fakeChannels{channels: map[ChannelKind]string{ChannelInfra: "c-velho"}, categories: map[string]string{}}
	got, err := EnsureChannels(context.Background(), store, "srv")
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"categoria Monitoramento", "erros em cat-nova", "qualidade em cat-nova", "resumo-diario em cat-nova"}
	if len(store.created) != len(want) {
		t.Fatalf("criados = %v", store.created)
	}
	for i := range want {
		if store.created[i] != want[i] {
			t.Fatalf("criados = %v", store.created)
		}
	}
	if got[ChannelInfra] != "c-velho" || got[ChannelDaily] != "c-resumo-diario" {
		t.Errorf("ids = %v", got)
	}
	// De novo: nada a criar.
	store.created = nil
	if _, err := EnsureChannels(context.Background(), store, "srv"); err != nil || len(store.created) != 0 {
		t.Fatalf("segunda vez criou %v (%v)", store.created, err)
	}
}

func TestEnsureChannelsReaproveitaCategoria(t *testing.T) {
	store := &fakeChannels{channels: map[ChannelKind]string{}, categories: map[string]string{"Monitoramento": "cat-1"}}
	if _, err := EnsureChannels(context.Background(), store, "srv"); err != nil {
		t.Fatal(err)
	}
	if store.created[0] != "alertas em cat-1" || len(store.created) != 4 {
		t.Fatalf("criados = %v", store.created)
	}
}

func TestEnsureChannelsErro(t *testing.T) {
	store := &fakeChannels{fail: errors.New("sem servidor")}
	if _, err := EnsureChannels(context.Background(), store, "srv"); err == nil {
		t.Fatal("erro sumiu")
	}
}
