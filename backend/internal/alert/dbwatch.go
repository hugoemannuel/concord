package alert

import (
	"context"
	"log"
	"time"
)

// Regra 4: banco fora. Sem banco não dá para postar; o backend pinga o banco
// a cada 15 s e, quando ele volta, avisa de quando a quando ficou sem.
const (
	dbPingEvery   = 15 * time.Second
	dbPingTimeout = 5 * time.Second
	// dbDownAfter: pings seguidos sem resposta para contar como queda (~45 s).
	// O ping usa o pool: com o pool esgotado ele também falha, e 3 seguidos
	// evitam o "banco fora" de um pico de uso.
	dbDownAfter = 3
)

// DatabaseWatch: o vigia do banco.
type DatabaseWatch struct {
	ping   func(ctx context.Context) error
	notify func(ctx context.Context, ev Event) error
	now    func() time.Time

	failures  int
	downSince time.Time
	// pending: a queda que ainda não conseguiu ser avisada.
	pending *Event
}

func NewDatabaseWatch(ping func(ctx context.Context) error, notify func(ctx context.Context, ev Event) error) *DatabaseWatch {
	return &DatabaseWatch{ping: ping, notify: notify, now: time.Now}
}

func (w *DatabaseWatch) Run(ctx context.Context) {
	ticker := time.NewTicker(dbPingEvery)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := w.Tick(ctx); err != nil {
				log.Printf("[alert] banco voltou, mas o aviso falhou: %v", err)
			}
		}
	}
}

// Tick: um ping. Quando o banco volta depois de uma queda, avisa.
func (w *DatabaseWatch) Tick(ctx context.Context) error {
	pingCtx, cancel := context.WithTimeout(ctx, dbPingTimeout)
	err := w.ping(pingCtx)
	cancel()
	now := w.now()
	if err != nil {
		if w.failures == 0 {
			w.downSince = now
		}
		w.failures++
		return nil
	}
	if w.failures >= dbDownAfter {
		w.pending = &Event{RuleID: databaseDownRuleID, Channel: ChannelInfra, Level: LevelWarning,
			Text: databaseDownText(w.downSince, now, now), StartedAt: w.downSince, EndedAt: now}
	}
	w.failures = 0
	return w.flush(ctx)
}

func (w *DatabaseWatch) flush(ctx context.Context) error {
	if w.pending == nil {
		return nil
	}
	if err := w.notify(ctx, *w.pending); err != nil {
		return err
	}
	w.pending = nil
	return nil
}
