package websocket

import (
	"encoding/json"
	"testing"

	"gin-quickstart/backend/internal/serverprofile"
	"gin-quickstart/backend/internal/user"
)

func nextType(t *testing.T, c *Client) string {
	t.Helper()
	select {
	case raw := <-c.send:
		var ev struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &ev); err != nil {
			t.Fatal(err)
		}
		return ev.Type
	default:
		return ""
	}
}

// O perfil vai só para quem está no servidor; a tag, para todo mundo.
func TestServerProfileEvents(t *testing.T) {
	h := NewHub()
	member, outsider := newTestClient(h, "ana"), newTestClient(h, "bia")
	h.Register(member)
	h.Register(outsider)
	h.Subscribe(member, "server:s1")
	for len(member.send) > 0 {
		<-member.send
	}
	for len(outsider.send) > 0 {
		<-outsider.send
	}

	h.PublishServerProfile(serverprofile.ProfileEvent{ServerID: "s1"})
	if got := nextType(t, member); got != "server:profile" {
		t.Errorf("membro recebeu %q", got)
	}
	if got := nextType(t, outsider); got != "" {
		t.Errorf("quem está fora recebeu %q", got)
	}

	h.PublishServerTag(serverprofile.TagEvent{ServerID: "s1"})
	h.PublishUserServerTag(serverprofile.UserTagEvent{UserID: "ana"})
	if a, b := nextType(t, outsider), nextType(t, outsider); a != "server:tag" || b != "user:server_tag" {
		t.Errorf("recebeu %q e %q", a, b)
	}
}

// Invisível e offline não entram na amostra de "Seus membros jogam".
func TestPlayingGamesSemInvisivel(t *testing.T) {
	h := NewHub()
	h.Register(newTestClient(h, "ana"))
	h.Register(newTestClient(h, "bia"))
	setGame(h, "ana", "Dota 2")
	setGame(h, "bia", "VALORANT")
	h.SetUserStatus("bia", user.StatusInvisible)

	plays := h.PlayingGames()
	if len(plays) != 1 || plays[0].UserID != "ana" || plays[0].Game.Name != "Dota 2" {
		t.Errorf("jogando = %+v", plays)
	}
}
