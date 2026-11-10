package call

import (
	"context"
	"errors"
	"testing"

	"gin-quickstart/backend/internal/channel"
)

// fakeCastigos: castigos fixos por servidor|usuário.
type fakeCastigos map[string]Restriction

func (f fakeCastigos) Restriction(serverID, userID string) Restriction {
	return f[serverID+"|"+userID]
}

func (f fakeCastigos) Punished(userID string) bool {
	for key := range f {
		if len(key) > len(userID) && key[len(key)-len(userID)-1:] == "|"+userID {
			return true
		}
	}
	return false
}

func castigoService(c fakeCastigos) (*Service, *fakeMedia) {
	svc, media, _ := newVoiceService(voiceSnapshot())
	svc.SetCastigos(c)
	svc.findChannel = func(_ context.Context, id string) (*channel.Channel, error) {
		return &channel.Channel{ID: id, ServerID: "srv-1", Type: channel.TypeVoice}, nil
	}
	return svc, media
}

func TestCastigoSemEntrarBarraAEntradaNaCall(t *testing.T) {
	svc, _ := castigoService(fakeCastigos{"srv-1|ana": {NoConnect: true}, "srv-1|vip": {NoSpeak: true}})
	ctx := context.Background()

	err := svc.requireConnect(ctx, "geral", "ana")
	if !errors.Is(err, ErrCastigo) || !errors.Is(err, ErrNoConnect) {
		t.Fatalf("ana de castigo: err = %v; quer ErrCastigo (que também é ErrNoConnect)", err)
	}
	if err := svc.requireConnect(ctx, "geral", "vip"); err != nil {
		t.Errorf("castigo só de falar não impede de entrar: %v", err)
	}
	if err := svc.requireConnect(ctx, "geral", "mod"); err != nil {
		t.Errorf("sem castigo entra: %v", err)
	}
}

func TestCastigoTiraFalaEEscutaDaMidia(t *testing.T) {
	svc, _ := castigoService(fakeCastigos{"srv-1|ana": {NoSpeak: true}, "srv-1|vip": {NoListen: true}})
	putInCall(svc, "c1", "geral", "ana", "vip", "mod")
	ctx := context.Background()

	if g := svc.GrantFor(ctx, "c1", "ana"); !g.NoSpeak || g.NoSubscribe {
		t.Errorf("ana sem falar: %+v", g)
	}
	if g := svc.GrantFor(ctx, "c1", "vip"); g.NoSpeak || !g.NoSubscribe {
		t.Errorf("vip sem ouvir: %+v", g)
	}
	if g := svc.GrantFor(ctx, "c1", "mod"); g.NoSpeak || g.NoSubscribe {
		t.Errorf("mod sem castigo: %+v", g)
	}
}

func TestCastigoSegueMesmoQueOModeradorLibereOSilencio(t *testing.T) {
	svc, media := castigoService(fakeCastigos{"srv-1|ana": {NoSpeak: true}})
	putInCall(svc, "c1", "geral", "ana", "mod")

	if err := svc.SetServerMute(context.Background(), "c1", "mod", "ana", false); err != nil {
		t.Fatal(err)
	}
	if len(media.updates) != 1 || !media.updates[0].grant.NoSpeak {
		t.Errorf("liberar o silêncio não tira o castigo: %+v", media.updates)
	}
}

func TestEnforceCastigo(t *testing.T) {
	castigos := fakeCastigos{}
	svc, media := castigoService(castigos)
	putInCall(svc, "c1", "geral", "ana", "vip", "mod")
	ctx := context.Background()

	castigos["srv-1|vip"] = Restriction{NoListen: true}
	svc.EnforceCastigo(ctx, "srv-1", "vip")
	if len(media.updates) != 1 || media.updates[0].identity != "vip" || !media.updates[0].grant.NoSubscribe {
		t.Fatalf("castigo de ouvir vai para a mídia: %+v", media.updates)
	}

	delete(castigos, "srv-1|vip")
	svc.EnforceCastigo(ctx, "srv-1", "vip")
	if len(media.updates) != 2 || media.updates[1].grant.NoSubscribe {
		t.Fatalf("fim do castigo devolve a escuta: %+v", media.updates)
	}

	castigos["srv-1|ana"] = Restriction{NoConnect: true}
	svc.EnforceCastigo(ctx, "srv-1", "ana")
	if svc.IsParticipant("c1", "ana") || len(media.removed) != 1 {
		t.Errorf("castigo sem entrar tira da call: removidos %v", media.removed)
	}

	svc.EnforceCastigo(ctx, "outro-srv", "mod")
	svc.EnforceCastigo(ctx, "srv-1", "zeca")
	if len(media.updates) != 2 || len(media.removed) != 1 {
		t.Errorf("outro servidor ou fora da call: nada muda (%+v, %v)", media.updates, media.removed)
	}
}

func TestRevalidateServerMantemOCastigo(t *testing.T) {
	svc, media := castigoService(fakeCastigos{"srv-1|ana": {NoConnect: true}, "srv-1|vip": {NoSpeak: true}})
	putInCall(svc, "c1", "geral", "ana", "vip")

	svc.RevalidateServer(context.Background(), "srv-1")
	if svc.IsParticipant("c1", "ana") {
		t.Error("de castigo sem entrar sai da call na revalidação")
	}
	if len(media.updates) != 1 || !media.updates[0].grant.NoSpeak {
		t.Errorf("revalidação mantém o castigo de falar: %+v", media.updates)
	}
}

func TestSemCastigosLigadosNadaMuda(t *testing.T) {
	svc, _, _ := newVoiceService(voiceSnapshot())
	putInCall(svc, "c1", "geral", "ana")
	if r := svc.castigoOf("srv-1", "ana"); r != (Restriction{}) {
		t.Errorf("sem fonte de castigos: %+v", r)
	}
	if svc.castigoBlocksJoin(context.Background(), "geral", "ana") {
		t.Error("sem fonte de castigos ninguém é barrado")
	}
}

func TestCastigoSemAcharOCanalBarraAEntrada(t *testing.T) {
	svc, _ := castigoService(fakeCastigos{"srv-1|ana": {NoSpeak: true}})
	svc.findChannel = func(context.Context, string) (*channel.Channel, error) { return nil, errors.New("banco fora") }
	if !svc.castigoBlocksJoin(context.Background(), "geral", "ana") {
		t.Error("quem tem castigo e o canal não foi achado não entra (falha fechada)")
	}
	if svc.castigoBlocksJoin(context.Background(), "geral", "bia") {
		t.Error("sem castigo nem procura o canal")
	}
}
