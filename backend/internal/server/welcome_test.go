package server

import (
	"context"
	"strings"
	"testing"
)

func TestWelcomeMessagesCatalog(t *testing.T) {
	if len(WelcomeMessages) < 30 {
		t.Fatalf("len(WelcomeMessages) = %d, want >= 30", len(WelcomeMessages))
	}

	seen := make(map[string]bool, len(WelcomeMessages))
	for i, tpl := range WelcomeMessages {
		if seen[tpl] {
			t.Fatalf("duplicate welcome template at %d: %q", i, tpl)
		}
		seen[tpl] = true

		msg := FormatWelcomeMessage(i, "armando")
		if !strings.Contains(msg, "@armando") {
			t.Fatalf("template %d (%q) did not include @armando: %q", i, tpl, msg)
		}
		if strings.Contains(msg, "%!") {
			t.Fatalf("template %d (%q) produced fmt error: %q", i, tpl, msg)
		}
	}

	rnd := RandomWelcomeMessage("bia")
	if !strings.Contains(rnd, "@bia") {
		t.Fatalf("RandomWelcomeMessage = %q, want @bia", rnd)
	}
}

func TestMemberJoinedHooksRun(t *testing.T) {
	svc := &Service{}
	var got []string
	svc.OnMemberJoined(func(_ context.Context, serverID string, m ServerMember) {
		got = append(got, serverID+":"+m.UserID+":"+m.Username)
	})
	svc.notifyMemberJoined(context.Background(), "srv1", ServerMember{UserID: "u1", Username: "ana"})
	if len(got) != 1 || got[0] != "srv1:u1:ana" {
		t.Fatalf("hooks = %v", got)
	}
}
