package alert

import (
	"context"
	"fmt"
	"time"
)

// Backend reiniciando sem parar: N boots sem parada limpa em 10 min
// (backend_runs). Vira um crítico só; enquanto ele está disparado o boot não
// posta o "backend no ar" de cada volta (boot.go).
const (
	restartLoopRuleID = "restart_loop"
	restartLoopWindow = 10 * time.Minute
	restartLoopBoots  = 3
)

type crashSource interface {
	CrashedRunsSince(ctx context.Context, since time.Time) (int, error)
}

func restartLoopRule(src crashSource) Rule {
	return Rule{
		ID: restartLoopRuleID, Title: "Backend reiniciando sem parar", Channel: ChannelInfra, Tab: "alertas",
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			n, err := src.CrashedRunsSince(ctx, now.Add(-restartLoopWindow))
			if err != nil {
				return Reading{Level: LevelUnknown}, err
			}
			if n < restartLoopBoots {
				return Reading{Level: LevelOK}, nil
			}
			return Reading{Level: LevelCritical, Text: fmt.Sprintf("o backend subiu %d vezes em 10 min sem desligamento limpo (journalctl -u concord-server)", n)}, nil
		},
	}
}
