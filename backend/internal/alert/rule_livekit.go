package alert

import (
	"context"
	"time"
)

// LiveKit fora (up = false no livekit_metrics: o /metrics dele não respondeu)
// e CPU do LiveKit (livekit_cpu_pct, em % de UMA vCPU: 200 = as duas).
const (
	// Aviso com 2 min fora; crítico com 5 (ninguém consegue falar nem ver live).
	liveKitDownWarnFor = 2 * time.Minute
	liveKitDownCritFor = 5 * time.Minute
	// liveKitSeenWithin: só avisa se o LiveKit respondeu alguma vez nessa
	// janela. Sem isso, uma instalação sem o Prometheus do LiveKit ligado
	// ficaria "fora" para sempre.
	liveKitSeenWithin = time.Hour

	// 150% = três quartos da máquina só para o SFU, por 5 min.
	liveKitCPUWarn = 150
	liveKitCPUFor  = 5 * time.Minute
)

func liveKitDownRule(src minuteSource) Rule {
	return Rule{
		ID: "livekit_down", Title: "LiveKit fora do ar", Channel: ChannelInfra, Tab: "servidor",
		Hold:  Hold{Warning: liveKitDownWarnFor, Critical: liveKitDownCritFor, Clear: time.Minute},
		Check: func(ctx context.Context, now time.Time) (Reading, error) { return liveKitDown(ctx, src, now) },
	}
}

func liveKitDown(ctx context.Context, src minuteSource, now time.Time) (Reading, error) {
	rows, err := src.RecentMinutes(ctx, now.Add(-liveKitSeenWithin))
	if err != nil || len(rows) == 0 || now.Sub(rows[0].Minute) > freshFor || !anyUp(rows) {
		return Reading{Level: LevelUnknown}, err
	}
	if rows[0].Up {
		return Reading{Level: LevelOK}, nil
	}
	return Reading{Level: LevelCritical, Text: "LiveKit não responde: calls e lives sem voz nem vídeo (systemctl status / docker logs do LiveKit)"}, nil
}

func anyUp(rows []Minute) bool {
	for _, m := range rows {
		if m.Up {
			return true
		}
	}
	return false
}

func liveKitCPURule(src minuteSource) Rule {
	return Rule{
		ID: "livekit_cpu", Title: "CPU do LiveKit", Channel: ChannelInfra, Tab: "servidor",
		Hold:  Hold{Warning: liveKitCPUFor, Clear: hostClearFor},
		Check: thresholdCheck(src, func(m Minute) *float64 { return m.LiveKitCPU }, limits{warn: liveKitCPUWarn}, "CPU do LiveKit em %.0f%% de uma vCPU (limite %.0f%%)"),
	}
}
