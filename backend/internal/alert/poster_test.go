package alert

import (
	"context"
	"errors"
	"testing"
	"time"
)

type written struct {
	channelID, text string
	mentionAll      bool
}

func newTestPoster(clock *time.Time) (*Poster, *[]written) {
	var out []written
	p := NewPoster(map[ChannelKind]string{ChannelInfra: "c-infra", ChannelQuality: "c-qual"},
		func(_ context.Context, channelID, text string, mentionAll bool) error {
			out = append(out, written{channelID, text, mentionAll})
			return nil
		})
	p.now = func() time.Time { return *clock }
	return p, &out
}

func TestPosterCriticoPingaTodos(t *testing.T) {
	clock := at(14, 0)
	p, out := newTestPoster(&clock)
	ctx := context.Background()
	if err := p.Send(ctx, ChannelInfra, LevelWarning, "a"); err != nil {
		t.Fatal(err)
	}
	if err := p.Send(ctx, ChannelQuality, LevelCritical, "b"); err != nil {
		t.Fatal(err)
	}
	want := []written{{"c-infra", "a", false}, {"c-qual", "b", true}}
	if len(*out) != 2 || (*out)[0] != want[0] || (*out)[1] != want[1] {
		t.Fatalf("escritas = %+v", *out)
	}
}

func TestPosterTetoPorHoraPorCanal(t *testing.T) {
	clock := at(14, 0)
	p, out := newTestPoster(&clock)
	ctx := context.Background()
	for i := 0; i < maxPerHour+3; i++ {
		_ = p.Send(ctx, ChannelInfra, LevelWarning, "x")
	}
	if len(*out) != maxPerHour {
		t.Fatalf("postou %d, teto %d", len(*out), maxPerHour)
	}
	// Outro canal tem o próprio teto.
	_ = p.Send(ctx, ChannelQuality, LevelWarning, "y")
	if len(*out) != maxPerHour+1 {
		t.Fatal("o teto de um canal bloqueou o outro")
	}
	// Uma hora depois, libera.
	clock = clock.Add(time.Hour)
	_ = p.Send(ctx, ChannelInfra, LevelWarning, "z")
	if len(*out) != maxPerHour+2 {
		t.Fatal("o teto não liberou depois de uma hora")
	}
}

func TestPosterCanalQueNaoExiste(t *testing.T) {
	clock := at(14, 0)
	p, _ := newTestPoster(&clock)
	if err := p.Send(context.Background(), ChannelDaily, LevelWarning, "x"); !errors.Is(err, errNoChannel) {
		t.Fatalf("erro = %v", err)
	}
}
