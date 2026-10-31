package music

import (
	"context"
	"testing"
)

// Escolher um resultado do seletor do /play usa o que a busca já trouxe, sem
// resolver o link de novo (mesma causa da demora do POST /enqueue, #445).
func TestPickUsesSearchResultWithoutResolving(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	src := &countingSource{mgrSource: mgrSource{fakeSource{fail: map[string]bool{}}}}
	m.deps.Source = src
	m.HandleCommand("srv1", "txt", "u1", "/play never gonna")
	var token string
	eventually(t, "music:search", func() bool {
		if s := hub.last("music:search"); s != nil {
			token, _ = s.body["token"].(string)
			return token != ""
		}
		return false
	})
	eventually(t, "livre de novo", func() bool { m.mu.Lock(); defer m.mu.Unlock(); return len(m.busy) == 0 })
	if err := m.Pick(context.Background(), "u1", token, 0); err != nil {
		t.Fatal(err)
	}
	if got := hub.publics(); len(got) != 1 || got[0] != TextAddedNow("caio", "Never", 213_000, "Sala 1") {
		t.Fatalf("público = %v", got)
	}
	if _, resolves := src.counts(); resolves != 0 {
		t.Fatalf("resoluções = %d, want 0", resolves)
	}
}

func TestEnqueueTrackRefusesLiveAndTooLong(t *testing.T) {
	m, hub := newTestManager(t, true, true)
	loc := Location{CallID: "call1", ChannelID: "voz1", ServerID: "srv1"}
	for _, tc := range []struct {
		name  string
		track Track
		want  string
	}{
		{"ao vivo", Track{VideoID: "aovivoxxxxx", IsLive: true}, TextLive},
		{"longo", Track{VideoID: "longoxxxxxx", DurationMs: maxVideoMs + 1}, TextTooLong},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var got string
			m.enqueueTrack(context.Background(), loc, "voz1", "u1", tc.track, func(s string) { got = s })
			if got != tc.want {
				t.Fatalf("texto = %q, want %q", got, tc.want)
			}
		})
	}
	if len(hub.publics()) != 0 {
		t.Fatalf("nada entra na fila: %v", hub.publics())
	}
}
