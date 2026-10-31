package audit

import (
	"context"
	"log"
	"time"
)

// writeTimeout limita a gravação: ela não segue o cancelamento do pedido (a
// ação já aconteceu e o registro não pode se perder porque o cliente fechou).
const writeTimeout = 5 * time.Second

type inserter interface {
	Insert(ctx context.Context, e Event) error
}

// Recorder é o ponto único de gravação do registro. Os domínios dependem só
// de uma interface com Record. Falhar ao gravar vai para o log e nunca
// desfaz nem quebra a ação principal.
type Recorder struct {
	store inserter
}

func NewRecorder(store inserter) *Recorder {
	return &Recorder{store: store}
}

func (r *Recorder) Record(ctx context.Context, e Event) {
	if r == nil || e.ServerID == "" {
		return
	}
	ctx, cancel := context.WithTimeout(context.WithoutCancel(ctx), writeTimeout)
	defer cancel()
	if err := r.store.Insert(ctx, e); err != nil {
		log.Printf("[auditoria] falha ao gravar %s no servidor %s: %v", e.Action, e.ServerID, err)
	}
}
