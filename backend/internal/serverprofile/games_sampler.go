package serverprofile

import (
	"context"
	"log"
	"time"
)

const (
	// gameSampleEvery: de quanto em quanto tempo o servidor olha quem está jogando.
	gameSampleEvery = 5 * time.Minute
	// gameTrimEvery: a cada quantas amostras a tabela é podada (1 hora).
	gameTrimEvery = 12
)

// PlayedGame: alguém jogando agora (websocket.Hub.PlayingGames).
type PlayedGame struct {
	UserID string
	Game   Game
}

// PlayingSource: quem está jogando agora, sem invisíveis nem offline.
type PlayingSource func() []PlayedGame

// SampleStore grava as amostras (Repository).
type SampleStore interface {
	RecordGameSamples(ctx context.Context, plays []PlayedGame) error
	TrimGameSamples(ctx context.Context) error
}

// GameSampler alimenta "Seus membros jogam": a atividade fica só na memória do
// hub, então uma amostra periódica é o que dá "os mais jogados" sem gravar quem
// jogou o quê.
type GameSampler struct {
	source PlayingSource
	store  SampleStore
	ticks  int
}

func NewGameSampler(source PlayingSource, store SampleStore) *GameSampler {
	return &GameSampler{source: source, store: store}
}

// Sample grava uma amostra; quem não joga (ou mandou lixo) não entra.
func (g *GameSampler) Sample(ctx context.Context) error {
	var plays []PlayedGame
	for _, p := range g.source() {
		if validGame(p.Game) {
			plays = append(plays, p)
		}
	}
	if len(plays) > 0 {
		if err := g.store.RecordGameSamples(ctx, plays); err != nil {
			return err
		}
	}
	g.ticks++
	if g.ticks%gameTrimEvery == 0 {
		return g.store.TrimGameSamples(ctx)
	}
	return nil
}

// Run amostra até o contexto acabar.
func (g *GameSampler) Run(ctx context.Context) {
	runEvery(ctx, gameSampleEvery, false, func() {
		if err := g.Sample(ctx); err != nil {
			log.Printf("[serverprofile] amostra de jogos: %v", err)
		}
	})
}
