// Package alert avisa, em canais de texto do servidor dos devs
// (ALERTS_SERVER_ID), falhas e limites do servidor: backend fora, CPU e
// memória no limite, LiveKit fora, banco fora, unidade do systemd que falhou
// e falhas de voz em massa. Ver docs/adr/0071-alertas-em-canais-do-servidor-dos-devs.md
// e docs/OBSERVABILIDADE.md § Alertas (como criar uma regra).
package alert

import (
	"context"
	"time"
)

// Level: o que uma regra viu agora.
type Level int

const (
	// LevelUnknown: sem dado (fonte velha ou erro). Não muda nada e zera a histerese.
	LevelUnknown Level = iota - 1
	LevelOK
	// LevelWarning: só a mensagem.
	LevelWarning
	// LevelCritical: a mensagem começa com @all e gera push para todos do servidor.
	LevelCritical
)

// Severity: como a gravidade fica gravada (alert_incidents.severity) e vai
// para o painel.
func (l Level) Severity() string {
	if l == LevelCritical {
		return "critico"
	}
	return "aviso"
}

func levelOf(severity string) Level {
	if severity == "critico" {
		return LevelCritical
	}
	return LevelWarning
}

// ChannelKind: em que canal a regra escreve (o channels.system_kind dele).
type ChannelKind string

const (
	// ChannelInfra (#alertas): backend, banco, máquina, LiveKit e serviços.
	ChannelInfra ChannelKind = "alert_infra"
	// ChannelErrors (#erros): erros do app (parte 2).
	ChannelErrors ChannelKind = "alert_errors"
	// ChannelQuality (#qualidade): calls e lives.
	ChannelQuality ChannelKind = "alert_quality"
	// ChannelDaily (#resumo-diario): o resumo do dia (parte 2).
	ChannelDaily ChannelKind = "alert_daily"
)

// Reading: o resultado de uma avaliação. Text descreve o que se viu, com o
// número e o limite ("CPU da máquina em 97% (limite 95%)"), sem ponto final.
type Reading struct {
	Level Level
	Text  string
}

// Hold: quanto tempo cada nível precisa se manter antes de valer (histerese).
// Warning/Critical: antes de disparar (ou agravar); Clear: o "ok" antes de
// normalizar. Zero = vale na primeira avaliação.
type Hold struct {
	Warning, Critical, Clear time.Duration
}

// Rule: uma regra. Regra nova = um arquivo rule_<nome>.go com o construtor e
// uma linha em rules.go.
type Rule struct {
	// ID: estável, vai para o banco e para ALERTS_MUTED ("host_cpu").
	ID string
	// Title: o nome curto que aparece no "normalizou" e no painel ("CPU da máquina").
	Title   string
	Channel ChannelKind
	// Tab: a aba do painel /observabilidade que mostra o assunto ("" = sem link).
	Tab  string
	Hold Hold
	// Check lê a fonte (só as últimas linhas) e diz o nível de agora.
	Check func(ctx context.Context, now time.Time) (Reading, error)
}

// Incident: um disparo de uma regra, de quando a quando (alert_incidents).
type Incident struct {
	ID            int64      `json:"id"`
	RuleID        string     `json:"rule_id"`
	Channel       string     `json:"channel"`
	Severity      string     `json:"severity"`
	StartedAt     time.Time  `json:"started_at"`
	EndedAt       *time.Time `json:"ended_at"`
	LastMessageAt *time.Time `json:"-"`
	Text          string     `json:"text"`
}

// Event: algo que aconteceu de uma vez (backend voltou, banco voltou, unidade
// falhou). Vira uma mensagem e um incidente já fechado.
type Event struct {
	RuleID  string
	Channel ChannelKind
	Level   Level
	// Text: a mensagem inteira, pronta (messages.go).
	Text      string
	StartedAt time.Time
	EndedAt   time.Time
}
