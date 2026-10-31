package call

import (
	"context"
	"reflect"
	"sort"
	"testing"
)

func TestCloseChannelCallRemovesEveryoneFromThatChannelOnly(t *testing.T) {
	svc, media, _ := newVoiceService(voiceSnapshot())
	putInCall(svc, "c1", "geral", "ana", "mod")
	putInCall(svc, "c2", "palco", "vip")

	svc.CloseChannelCall(context.Background(), "srv-1", "geral")

	if svc.IsParticipant("c1", "ana") || svc.IsParticipant("c1", "mod") {
		t.Fatal("quem estava no canal fechado devia sair")
	}
	if !svc.IsParticipant("c2", "vip") {
		t.Fatal("a chamada de outro canal não pode ser mexida")
	}
	got := append([]string{}, media.removed...)
	sort.Strings(got)
	if want := []string{"c1|ana", "c1|mod"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("mídia: %v, esperava %v", got, want)
	}
}

func TestCloseChannelCallWithoutCallDoesNothing(t *testing.T) {
	svc, media, _ := newVoiceService(voiceSnapshot())
	svc.CloseChannelCall(context.Background(), "srv-1", "geral")
	if len(media.removed) != 0 {
		t.Fatalf("nada devia ser removido: %v", media.removed)
	}
}
