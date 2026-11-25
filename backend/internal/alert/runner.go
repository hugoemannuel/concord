package alert

import (
	"context"
	"log"
	"time"
)

// stopTimeout: quanto a parada limpa espera para gravar o stopped_at.
const stopTimeout = 2 * time.Second

// Runner liga tudo na ordem: garante os canais, lê o estado, posta o boot,
// vigia o banco e avalia as regras até o desligamento, quando grava a parada
// limpa.
type Runner struct {
	Ensure    func(ctx context.Context) (map[ChannelKind]string, error)
	Poster    *Poster
	Engine    *Engine
	Lifecycle *Lifecycle
	Database  *DatabaseWatch
}

func (r Runner) Run(ctx context.Context) {
	channels, err := r.Ensure(ctx)
	if err != nil {
		log.Printf("[alert] alertas desligados: não consegui garantir os canais: %v", err)
		return
	}
	r.Poster.SetChannels(channels)
	if err := r.Engine.Load(ctx); err != nil {
		log.Printf("[alert] estado: %v", err)
	}
	if err := r.Lifecycle.Boot(ctx); err != nil {
		log.Printf("[alert] boot: %v", err)
	}
	go r.Database.Run(ctx)
	r.Engine.Run(ctx)
	stopCtx, cancel := context.WithTimeout(context.Background(), stopTimeout)
	defer cancel()
	if err := r.Lifecycle.Stop(stopCtx); err != nil {
		log.Printf("[alert] parada limpa: %v", err)
	}
}
