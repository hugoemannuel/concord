// Package audittest tem o gravador falso do registro de auditoria para os
// testes dos domínios.
package audittest

import (
	"context"
	"sync"

	"gin-quickstart/backend/internal/audit"
)

// Recorder guarda os eventos em memória, na ordem em que chegaram.
type Recorder struct {
	mu     sync.Mutex
	events []audit.Event
}

func (r *Recorder) Record(_ context.Context, e audit.Event) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, e)
}

// Events devolve uma cópia dos eventos gravados.
func (r *Recorder) Events() []audit.Event {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]audit.Event{}, r.events...)
}

// Last devolve o último evento (ok=false se nada foi gravado).
func (r *Recorder) Last() (audit.Event, bool) {
	events := r.Events()
	if len(events) == 0 {
		return audit.Event{}, false
	}
	return events[len(events)-1], true
}
