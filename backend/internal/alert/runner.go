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
	// Watches: os vigias de acontecimentos e as tarefas com horário (máquina
	// congelada, erro novo, resumo diário), soltos depois do boot até ctx acabar.
	Watches []func(ctx context.Context)
	// RetryEvery: espera entre as tentativas de ler o estado no boot.
	RetryEvery time.Duration
}

func (r Runner) Run(ctx context.Context) {
	channels, err := r.Ensure(ctx)
	if err != nil {
		log.Printf("[alert] alertas desligados: não consegui garantir os canais: %v", err)
		return
	}
	r.Poster.SetChannels(channels)
	if !r.loadState(ctx) {
		return
	}
	if err := r.Lifecycle.Boot(ctx); err != nil {
		log.Printf("[alert] boot: %v", err)
	}
	go r.Database.Run(ctx)
	for _, watch := range r.Watches {
		go watch(ctx)
	}
	r.Engine.Run(ctx)
	stopCtx, cancel := context.WithTimeout(context.Background(), stopTimeout)
	defer cancel()
	if err := r.Lifecycle.Stop(stopCtx); err != nil {
		log.Printf("[alert] parada limpa: %v", err)
	}
}

// loadState lê o estado (incidentes abertos) até conseguir: sem ele, uma
// regra disparada bateria no índice único do incidente aberto a cada minuto.
// false = o desligamento chegou antes.
func (r Runner) loadState(ctx context.Context) bool {
	for {
		err := r.Engine.Load(ctx)
		if err == nil {
			return true
		}
		log.Printf("[alert] estado: %v (tento de novo)", err)
		select {
		case <-ctx.Done():
			return false
		case <-time.After(r.RetryEvery):
		}
	}
}

// every roda fn a cada d até ctx acabar (o erro só vai para o log).
func every(ctx context.Context, d time.Duration, what string, fn func(context.Context) error) {
	ticker := time.NewTicker(d)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := fn(ctx); err != nil {
				log.Printf("[alert] %s: %v", what, err)
			}
		}
	}
}
