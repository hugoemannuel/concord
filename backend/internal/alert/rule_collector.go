package alert

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Coleta parada com o backend no ar: a regra roda no próprio backend, então
// ele está de pé; se api_metrics, host_metrics ou livekit_metrics não ganham
// linha há 5 min, o coletor daquela tabela travou ou está falhando ao gravar,
// e as regras dela ficam em "sem dado" em silêncio. 10 min seguidos antes de
// avisar: depois de um boot (ou do relógio saltar com o NTP) a linha nova
// chega em 1 min e zera a contagem. Tabela vazia (coletor nunca ligado) ou
// parada há mais de 24 h (desligado de propósito) não conta.
const (
	collectorStaleAfter  = 5 * time.Minute
	collectorIgnoreAfter = 24 * time.Hour
)

type collectorSource interface {
	hostSource
	apiSource
	LastMinute(ctx context.Context) (*time.Time, error)
}

func collectorRule(src collectorSource) Rule {
	return Rule{
		ID: "collector_stalled", Title: "Coleta parada", Channel: ChannelInfra, Tab: "servidor",
		Hold: Hold{Warning: 10 * time.Minute, Clear: 2 * time.Minute},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			tables, err := lastRows(ctx, src)
			if err != nil {
				return Reading{Level: LevelUnknown}, err
			}
			return staleTables(tables, now), nil
		},
	}
}

type lastRow struct {
	table string
	at    *time.Time
}

func lastRows(ctx context.Context, src collectorSource) ([]lastRow, error) {
	host, err := src.LatestHost(ctx)
	if err != nil {
		return nil, err
	}
	api, err := src.LatestAPI(ctx)
	if err != nil {
		return nil, err
	}
	livekit, err := src.LastMinute(ctx)
	if err != nil {
		return nil, err
	}
	out := []lastRow{{table: "livekit_metrics", at: livekit}}
	if host != nil {
		out = append(out, lastRow{"host_metrics", &host.Minute})
	}
	if api != nil {
		out = append(out, lastRow{"api_metrics", &api.Minute})
	}
	return out, nil
}

func staleTables(tables []lastRow, now time.Time) Reading {
	var stale []string
	var oldest time.Duration
	watched := 0
	for _, t := range tables {
		if t.at == nil || now.Sub(*t.at) > collectorIgnoreAfter {
			continue
		}
		watched++
		if age := now.Sub(*t.at); age > collectorStaleAfter {
			stale, oldest = append(stale, t.table), max(oldest, age)
		}
	}
	switch {
	case watched == 0:
		return Reading{Level: LevelUnknown}
	case len(stale) == 0:
		return Reading{Level: LevelOK}
	}
	return Reading{Level: LevelWarning, Text: fmt.Sprintf(
		"a coleta parou com o backend no ar: %s sem linha nova há %s (limite 5 min); o painel e os alertas dessas tabelas ficam cegos; veja o journalctl -u concord-server",
		strings.Join(stale, ", "), duration(oldest))}
}
