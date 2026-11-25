package alert

import (
	"context"
	"time"

	"gin-quickstart/backend/internal/apperrors"
	"gin-quickstart/backend/internal/serverobs"
)

// As fontes que vêm de outros pacotes (só leitura): a máquina e a API do
// serverobs (ADR 0067) e os erros do app do apperrors (ADR 0068).

// hostSource: as linhas de host_metrics (serverobs.HostRepository).
type hostSource interface {
	LatestHost(ctx context.Context) (*serverobs.HostMinute, error)
	// RecentHost: as dos últimos minutes minutos, da mais antiga à mais nova.
	RecentHost(ctx context.Context, minutes int) ([]serverobs.HostMinute, error)
}

// apiSource: as linhas de api_metrics e as rotas (serverobs.APIRepository).
type apiSource interface {
	LatestAPI(ctx context.Context) (*serverobs.APIMinute, error)
	// RecentAPI: as dos últimos minutes minutos, da mais antiga à mais nova.
	RecentAPI(ctx context.Context, minutes int) ([]serverobs.APIMinute, error)
	// Routes: as rotas em (from, to], com 5xx primeiro, depois as que mais gastaram tempo.
	Routes(ctx context.Context, from, to time.Time, limit int) ([]serverobs.RouteRow, error)
}

// errorSource: os grupos de erro do app (apperrors.Repository).
type errorSource interface {
	GroupsFirstSeenSince(ctx context.Context, since time.Time) ([]apperrors.GroupHead, error)
	AffectedByGroup(ctx context.Context, from, to time.Time) ([]apperrors.GroupImpact, error)
}

// Feeds junta as fontes das regras: o Repository do alerta e as leituras de
// fora. Implementa Sources.
type Feeds struct {
	*Repository
	hostSource
	apiSource
	errorSource
}

// NewFeeds: host e api do serverobs, errs do apperrors.
func NewFeeds(repo *Repository, host hostSource, api apiSource, errs errorSource) Feeds {
	return Feeds{Repository: repo, hostSource: host, apiSource: api, errorSource: errs}
}

// freshHost: a linha mais nova de host_metrics, se for recente (nil = sem dado).
func freshHost(ctx context.Context, src hostSource, now time.Time) (*serverobs.HostMinute, error) {
	h, err := src.LatestHost(ctx)
	if err != nil || h == nil || now.Sub(h.Minute) > freshFor {
		return nil, err
	}
	return h, nil
}

// freshAPI: a linha mais nova de api_metrics, se for recente (nil = sem dado).
func freshAPI(ctx context.Context, src apiSource, now time.Time) (*serverobs.APIMinute, error) {
	m, err := src.LatestAPI(ctx)
	if err != nil || m == nil || now.Sub(m.Minute) > freshFor {
		return nil, err
	}
	return m, nil
}

// hostCheck: compara um número da linha mais nova de host_metrics com os limites.
func hostCheck(src hostSource, pick func(serverobs.HostMinute) *float64, lim limits, format string) func(context.Context, time.Time) (Reading, error) {
	return func(ctx context.Context, now time.Time) (Reading, error) {
		h, err := freshHost(ctx, src, now)
		if err != nil || h == nil || pick(*h) == nil {
			return Reading{Level: LevelUnknown}, err
		}
		return levelFor(*pick(*h), lim, format), nil
	}
}
