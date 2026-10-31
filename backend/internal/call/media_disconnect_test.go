package call

import (
	"errors"
	"testing"
	"time"
)

// Regressão (31/10/2026): a rede do usuário trocou de IP no meio da call. O
// LiveKit reconectou sozinho, mas o WebSocket de chat ficou meio aberto; o
// servidor fechou o lado dele e, passada a tolerância, tirou o usuário da
// chamada. Ele seguia falando e ouvindo, mas sumiu da lista de todo mundo.

// disconnectFixture: "call-1" com user-1, WS caído e a saída real trocada por
// um registro; a guarda da sala de mídia ligada.
func disconnectFixture(t *testing.T) *presenceFixture {
	t.Helper()
	f := newPresenceFixture("user-1")
	f.service.isOnline = func(string) bool { return false }
	f.service.disconnectGrace = 5 * time.Millisecond
	f.presence.KeepWhoIsInMedia()
	return f
}

func (f *presenceFixture) leftAfterDisconnect(userID string) []string {
	f.service.HandleDisconnect(userID)
	time.Sleep(50 * time.Millisecond)
	f.leftMu.Lock()
	defer f.leftMu.Unlock()
	return append([]string(nil), (*f.left)...)
}

func TestDisconnectKeepsWhoIsStillInMedia(t *testing.T) {
	f := disconnectFixture(t)
	f.roster.set("call-1", "user-1")

	if left := f.leftAfterDisconnect("user-1"); len(left) != 0 {
		t.Fatalf("saiu da chamada estando na sala de mídia: %v", left)
	}
	if !f.service.IsParticipant("call-1", "user-1") {
		t.Fatal("user-1 deveria seguir na chamada")
	}
}

func TestDisconnectLeavesWhoIsNotInMedia(t *testing.T) {
	f := disconnectFixture(t)
	f.roster.set("call-1", "user-2", "user-1:screen")

	left := f.leftAfterDisconnect("user-1")
	if len(left) != 1 || left[0] != "call-1/user-1" {
		t.Fatalf("left = %v, want [call-1/user-1]", left)
	}
}

func TestDisconnectLeavesWhenMediaIsUnknown(t *testing.T) {
	f := disconnectFixture(t)
	f.roster.err = errors.New("livekit fora do ar")

	left := f.leftAfterDisconnect("user-1")
	if len(left) != 1 || left[0] != "call-1/user-1" {
		t.Fatalf("left = %v, want [call-1/user-1]", left)
	}
}

// O app reconectou o WS dentro da tolerância: nem pergunta ao LiveKit.
func TestDisconnectWithinGraceDoesNotAskMedia(t *testing.T) {
	f := disconnectFixture(t)
	f.service.isOnline = func(string) bool { return true }

	if left := f.leftAfterDisconnect("user-1"); len(left) != 0 {
		t.Fatalf("left = %v, want []", left)
	}
	f.roster.mu.Lock()
	defer f.roster.mu.Unlock()
	if f.roster.asked != 0 {
		t.Fatalf("LiveKit consultado %d vez(es), want 0", f.roster.asked)
	}
}
