package alert

import (
	"context"
	"fmt"
	"time"
)

// Capacidade das lives: o pico de saída do LiveKit na semana (livekit_metrics,
// bytes_out por minuto). A análise de 11 a 25/11/2026 mediu ~2,8% de uma vCPU
// por Mbps no LiveKit e a máquina chegando a 85% de CPU perto de 60 Mbps,
// uns 13 espectadores de live ao mesmo tempo (cada um ~4,5 Mbps). Passou de
// 45 Mbps na semana: aviso para planejar mais vCPU, antes do teto. É
// planejamento: lembra a cada 7 dias (não a cada 6 h) e a consulta da semana
// roda uma vez por hora.
const (
	capacityWarnMbps = 45
	capacityCeilMbps = 60
	capacityWindow   = 7 * 24 * time.Hour
	capacityRefresh  = time.Hour
)

type egressSource interface {
	PeakEgress(ctx context.Context, since time.Time) (*Peak, error)
}

func capacityRule(src egressSource) Rule {
	c := &capacityCheck{src: src}
	return Rule{
		ID: "live_capacity", Title: "Capacidade das lives", Channel: ChannelInfra, Tab: "servidor",
		Remind: capacityWindow,
		Check:  c.check,
	}
}

// capacityCheck guarda o pico da semana por uma hora.
type capacityCheck struct {
	src   egressSource
	at    time.Time
	cache Reading
}

func (c *capacityCheck) check(ctx context.Context, now time.Time) (Reading, error) {
	if !c.at.IsZero() && now.Sub(c.at) < capacityRefresh && now.After(c.at) {
		return c.cache, nil
	}
	peak, err := c.src.PeakEgress(ctx, now.Add(-capacityWindow))
	if err != nil {
		return Reading{Level: LevelUnknown}, err
	}
	c.at, c.cache = now, capacityReading(peak, now)
	return c.cache, nil
}

func capacityReading(peak *Peak, now time.Time) Reading {
	switch {
	case peak == nil:
		return Reading{Level: LevelUnknown}
	case peak.Mbps < capacityWarnMbps:
		return Reading{Level: LevelOK}
	}
	return Reading{Level: LevelWarning, Text: fmt.Sprintf(
		"o pico de saída das lives nos últimos 7 dias foi %.0f Mbps (%s; limite %d): o teto de CPU da VPS fica perto de %d Mbps, uns 13 espectadores de live ao mesmo tempo; hora de planejar mais vCPU",
		peak.Mbps, clock(peak.Minute, now), capacityWarnMbps, capacityCeilMbps)}
}
