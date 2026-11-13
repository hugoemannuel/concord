package message

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"gin-quickstart/backend/internal/channel"
	"gin-quickstart/backend/internal/permission"
)

type fakeViewOnceChannels map[string]*channel.Channel

func (f fakeViewOnceChannels) FindByID(_ context.Context, id string) (*channel.Channel, error) {
	ch, ok := f[id]
	if !ok {
		return nil, errors.New("canal não encontrado")
	}
	return ch, nil
}

type fakeSnapshots struct{ snap *permission.Snapshot }

func (f fakeSnapshots) Snapshot(context.Context, string) (*permission.Snapshot, error) {
	return f.snap, nil
}

// privadoSnapshot: canal "priv" que só o cargo "A" vê (a dona, ana, vê tudo).
func privadoSnapshot() *permission.Snapshot {
	return permission.NewSnapshot("s1", "ana", permission.DefaultEveryone).
		WithRole("A", 1, 0).
		WithMember("ana").
		WithMember("bia", "A").
		WithMember("caio").
		WithMember("duda", "A").
		WithMember("robo", "A").
		WithChannel("priv", permission.ChannelText,
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "everyone", Deny: permission.ViewChannel},
			permission.Overwrite{TargetType: permission.TargetRole, TargetID: "A", Allow: permission.ViewChannel},
		)
}

func textoPriv() *channel.Channel {
	return &channel.Channel{ID: "priv", ServerID: "s1", Type: channel.TypeText, AllowViewOnce: true}
}

func channelViewOnce(repo *fakeViewOnceRepo, ch *channel.Channel) *ViewOnceService {
	svc := NewViewOnceService(repo, nil)
	svc.SetChannels(fakeViewOnceChannels{ch.ID: ch}, fakeSnapshots{privadoSnapshot()})
	return svc
}

// Canal privado: destinatários são só quem vê o canal (cargo "A"), sem o autor
// e sem o bot.
func TestPrepareCanalDestinatariosQuemVeOCanal(t *testing.T) {
	repo := &fakeViewOnceRepo{bots: []string{"robo"}}
	svc := channelViewOnce(repo, textoPriv())
	if err := svc.Prepare(context.Background(), Room{ChannelID: "priv"}, "ana", []string{"x"}, nil, nil); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(repo.recipients, []string{"bia", "duda"}) || repo.room != (Room{ChannelID: "priv"}) {
		t.Fatalf("destinatários = %v, sala = %+v", repo.recipients, repo.room)
	}
}

func TestPrepareCanalRecusas(t *testing.T) {
	cases := []struct {
		name   string
		change func(*channel.Channel)
	}{
		{"visualização única desligada", func(c *channel.Channel) { c.AllowViewOnce = false }},
		{"canal de sistema", func(c *channel.Channel) { c.IsSystem = true }},
		{"tipo que não é texto nem voz", func(c *channel.Channel) { c.Type = "category" }},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			ch := textoPriv()
			c.change(ch)
			repo := &fakeViewOnceRepo{}
			err := channelViewOnce(repo, ch).Prepare(context.Background(), Room{ChannelID: "priv"}, "ana", []string{"x"}, nil, nil)
			if !errors.Is(err, ErrInvalidViewOnce) || repo.marked {
				t.Fatalf("err = %v, marcou = %v", err, repo.marked)
			}
		})
	}
}

// Canal de voz também aceita (o chat do canal de voz).
func TestPrepareCanalDeVozAceita(t *testing.T) {
	ch := textoPriv()
	ch.Type = channel.TypeVoice
	repo := &fakeViewOnceRepo{}
	if err := channelViewOnce(repo, ch).Prepare(context.Background(), Room{ChannelID: "priv"}, "ana", []string{"x"}, nil, nil); err != nil || !repo.marked {
		t.Fatalf("err = %v, marcou = %v", err, repo.marked)
	}
}

// Sem a leitura do canal ligada, o canal recusa (nunca marca sem saber quem vê).
func TestPrepareCanalSemLeituraRecusa(t *testing.T) {
	repo := &fakeViewOnceRepo{}
	err := NewViewOnceService(repo, nil).Prepare(context.Background(), Room{ChannelID: "priv"}, "ana", []string{"x"}, nil, nil)
	if !errors.Is(err, ErrInvalidViewOnce) || repo.marked {
		t.Fatalf("err = %v, marcou = %v", err, repo.marked)
	}
}
