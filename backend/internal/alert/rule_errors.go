package alert

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gin-quickstart/backend/internal/apperrors"
)

// Pico de erro (#erros): um grupo de erro atingindo 5 pessoas diferentes em
// 15 min (app_error_occurrences, por pessoa com conta) é algo quebrado para
// muita gente ao mesmo tempo: crítico. O grupo é pequeno (picos de ~15
// pessoas na call): 5 é um terço de quem está usando. Normaliza depois de
// 30 min abaixo. Panic do backend sem conta não conta pessoas (sai em
// api_panics).
const (
	spikePeople   = 5
	spikeWindow   = 15 * time.Minute
	spikeClearFor = 30 * time.Minute
)

type impactSource interface {
	AffectedByGroup(ctx context.Context, from, to time.Time) ([]apperrors.GroupImpact, error)
}

func errorSpikeRule(src impactSource) Rule {
	return Rule{
		ID: "error_spike", Title: "Pico de erro", Channel: ChannelErrors, Tab: "erros",
		Hold: Hold{Clear: spikeClearFor},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			groups, err := src.AffectedByGroup(ctx, now.Add(-spikeWindow), now)
			if err != nil {
				return Reading{Level: LevelUnknown}, err
			}
			if len(groups) == 0 || groups[0].Users < spikePeople {
				return Reading{Level: LevelOK}, nil
			}
			g := groups[0]
			return Reading{Level: LevelCritical, Text: fmt.Sprintf(
				"o erro %q (%s) atingiu %d pessoas em 15 min (limite %d): algo quebrou para muita gente; veja a aba Erros e, se veio com a última versão, reverta",
				short(errorLine(g.Kind, g.Message)), sourceLabel(g.Source), g.Users, spikePeople)}, nil
		},
	}
}

// sourceLabel: de onde veio o erro, em palavras.
func sourceLabel(source string) string {
	switch source {
	case apperrors.SourceRenderer:
		return "app"
	case apperrors.SourceMain:
		return "Electron (main)"
	case apperrors.SourceMobile:
		return "Android"
	case apperrors.SourceBackend:
		return "backend"
	}
	return source
}

// errorLine: "TypeError: x is undefined" (sem repetir o tipo que já está na mensagem).
func errorLine(kind, message string) string {
	if kind == "" || strings.HasPrefix(message, kind) {
		return message
	}
	return kind + ": " + message
}

// short: no máximo errorTextMax letras, com "…".
func short(s string) string {
	return shortN(s, errorTextMax)
}
