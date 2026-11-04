package serverprofile

import (
	"context"
	"errors"
	"testing"
)

type fakeSamples struct {
	plays  [][]PlayedGame
	trims  int
	failOn error
}

func (f *fakeSamples) RecordGameSamples(_ context.Context, plays []PlayedGame) error {
	f.plays = append(f.plays, plays)
	return f.failOn
}

func (f *fakeSamples) TrimGameSamples(context.Context) error {
	f.trims++
	return nil
}

func TestGameSamplerGravaSoOQueVale(t *testing.T) {
	store := &fakeSamples{}
	sampler := NewGameSampler(func() []PlayedGame {
		return []PlayedGame{
			{UserID: "ana", Game: Game{Name: "Dota 2"}},
			{UserID: "bia", Game: Game{Name: ""}},
		}
	}, store)
	if err := sampler.Sample(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(store.plays) != 1 || len(store.plays[0]) != 1 || store.plays[0][0].UserID != "ana" {
		t.Errorf("amostra = %+v", store.plays)
	}
}

func TestGameSamplerSemNinguemNaoEscreve(t *testing.T) {
	store := &fakeSamples{}
	sampler := NewGameSampler(func() []PlayedGame { return nil }, store)
	if err := sampler.Sample(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(store.plays) != 0 {
		t.Errorf("escreveu sem ninguém jogando: %+v", store.plays)
	}
}

func TestGameSamplerPodaDeTempoEmTempo(t *testing.T) {
	store := &fakeSamples{}
	sampler := NewGameSampler(func() []PlayedGame { return nil }, store)
	for i := 0; i < gameTrimEvery; i++ {
		if err := sampler.Sample(context.Background()); err != nil {
			t.Fatal(err)
		}
	}
	if store.trims != 1 {
		t.Errorf("podas = %d, quer 1", store.trims)
	}
}

func TestGameSamplerErro(t *testing.T) {
	boom := errors.New("banco fora")
	store := &fakeSamples{failOn: boom}
	sampler := NewGameSampler(func() []PlayedGame {
		return []PlayedGame{{UserID: "ana", Game: Game{Name: "Dota 2"}}}
	}, store)
	if err := sampler.Sample(context.Background()); !errors.Is(err, boom) {
		t.Errorf("erro = %v", err)
	}
}
