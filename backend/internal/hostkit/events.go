package hostkit

import (
	"encoding/json"
	"io"
	"sync"
)

// Event é uma linha JSON no stdout do salinha-host: o app (hostSetup.ts) lê e
// mostra o progresso no assistente "Hospedar um servidor".
type Event struct {
	// Type: "step" (andamento de uma etapa), "network-needed" (UPnP não deu,
	// a pessoa escolhe playit ou rede local), "ready" (servidor no ar) ou "error".
	Type string `json:"type"`
	// Step: "setup", "database", "start" ou "network".
	Step string `json:"step,omitempty"`
	// State: "running", "done" ou "error".
	State   string `json:"state,omitempty"`
	Message string `json:"message,omitempty"`
	// Warning: algo não deu, mas não impede (ex.: iniciar junto com o sistema).
	Warning string `json:"warning,omitempty"`
	// Reason (network-needed): "cgnat", "upnp-unavailable" ou "upnp-failed".
	Reason    string `json:"reason,omitempty"`
	LocalURL  string `json:"localUrl,omitempty"`
	PublicURL string `json:"publicUrl,omitempty"`
	LanURL    string `json:"lanUrl,omitempty"`
	// Mode (ready): "upnp", "playit" ou "lan".
	Mode string `json:"mode,omitempty"`
}

// Emitter escreve os eventos, um por linha (seguro entre goroutines).
type Emitter struct {
	mu  sync.Mutex
	out io.Writer
}

func NewEmitter(out io.Writer) *Emitter { return &Emitter{out: out} }

func (e *Emitter) Emit(ev Event) {
	if e == nil || e.out == nil {
		return
	}
	line, err := json.Marshal(ev)
	if err != nil {
		return
	}
	e.mu.Lock()
	defer e.mu.Unlock()
	_, _ = e.out.Write(append(line, '\n'))
}

func (e *Emitter) Step(step, state, message string) {
	e.Emit(Event{Type: "step", Step: step, State: state, Message: message})
}
