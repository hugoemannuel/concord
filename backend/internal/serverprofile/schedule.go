package serverprofile

import (
	"context"
	"time"
)

// runEvery roda work de tempos em tempos até o contexto acabar. now: também na
// largada.
func runEvery(ctx context.Context, every time.Duration, now bool, work func()) {
	if now {
		work()
	}
	ticker := time.NewTicker(every)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			work()
		}
	}
}
