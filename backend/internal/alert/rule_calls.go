package alert

import (
	"context"
	"fmt"
	"time"
)

// Falhas de voz de várias pessoas ao mesmo tempo (live_events, ADR 0032):
// costuma ser configuração do servidor (LIVEKIT_NODE_IP, firewall, LiveKit
// reiniciado), não a rede de alguém. Em #qualidade: não conectar é crítico
// (ninguém entra na call); reconectar é aviso (a voz já voltou sozinha).
const (
	callFailWindow  = 5 * time.Minute
	callFailPeople  = 3
	reconnectWindow = 3 * time.Minute
	reconnectPeople = 4
	// callClearFor: a janela precisa ficar abaixo do limite por isso antes de normalizar.
	callClearFor = 10 * time.Minute

	// O app grava o detalhe do conexao_falhou como "<etapa>: <motivo>"
	// (features/observability/lib/telemetryConnection.ts).
	mediaStepPrefix = "entrando (mídia)"
)

type eventSource interface {
	PeopleWithEvent(ctx context.Context, eventType, detailPrefix string, since time.Time) (int, error)
}

func callFailuresRule(src eventSource) Rule {
	return Rule{
		ID: "call_failures", Title: "Voz sem conectar", Channel: ChannelQuality, Tab: "chamadas",
		Hold: Hold{Clear: callClearFor},
		Check: peopleCheck(src, "conexao_falhou", mediaStepPrefix, callFailWindow, callFailPeople, LevelCritical,
			"%d pessoas não conseguiram conectar a voz na etapa de mídia em 5 min (limite %d); costuma ser o servidor: LiveKit, LIVEKIT_NODE_IP ou firewall"),
	}
}

func callReconnectsRule(src eventSource) Rule {
	return Rule{
		ID: "call_reconnects", Title: "Voz reconectando em massa", Channel: ChannelQuality, Tab: "chamadas",
		Hold: Hold{Clear: callClearFor},
		Check: peopleCheck(src, "reconectou", "", reconnectWindow, reconnectPeople, LevelWarning,
			"%d pessoas com a voz caindo e voltando em 3 min (limite %d); costuma ser o LiveKit reiniciando ou a rede da VPS"),
	}
}

func peopleCheck(src eventSource, eventType, prefix string, window time.Duration, people int, level Level, format string) func(context.Context, time.Time) (Reading, error) {
	return func(ctx context.Context, now time.Time) (Reading, error) {
		n, err := src.PeopleWithEvent(ctx, eventType, prefix, now.Add(-window))
		if err != nil {
			return Reading{Level: LevelUnknown}, err
		}
		if n < people {
			return Reading{Level: LevelOK}, nil
		}
		return Reading{Level: level, Text: fmt.Sprintf(format, n, people)}, nil
	}
}
