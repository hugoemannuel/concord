package alert

import (
	"context"
	"fmt"
	"time"

	"gin-quickstart/backend/internal/serverobs"
)

// API com erro (5xx e panic) e API lenta (p95), de api_metrics (uma linha por
// minuto) e api_route_metrics (rotas de 5 em 5 min), ADR 0067.
//
// 5xx: a taxa dos últimos 5 min, com volume mínimo (10 erros) para um pedido
// só, de madrugada, não disparar. Aviso em 5% por 3 min; crítico em 25% (e
// 50 erros) por 5 min: um quarto dos pedidos falhando é o app quebrado para
// todo mundo. Panic: qualquer um em 15 min é bug (o gin devolve 500 e segue);
// normaliza depois de 30 min sem.
//
// Lenta: o p95 do minuto (por baldes: 1 s, 2,5 s, 5 s...), só com 20 pedidos
// ou mais no minuto. Um pedido comum leva menos de 250 ms; 2 s por 5 min
// seguidos já é o app "travando" para quem usa; 5 s por 10 min é o app
// parado (crítico).
const (
	apiErrWindowMin = 5
	apiErrMinErrors = 10
	apiErrWarnRatio = 0.05
	apiErrCritRatio = 0.25
	apiErrCritMin   = 50

	panicWindowMin = 15
	panicClearFor  = 30 * time.Minute

	apiSlowWarnMs  = 2000
	apiSlowCritMs  = 5000
	apiSlowMinReqs = 20

	// routeLookback: as rotas da última janela de 5 min já gravada (e a anterior).
	routeLookback = 10 * time.Minute
	routeTop      = 20
)

func apiErrorsRule(src apiSource) Rule {
	return Rule{
		ID: "api_errors", Title: "API com erro 5xx", Channel: ChannelInfra, Tab: "servidor",
		Hold: Hold{Warning: 3 * time.Minute, Critical: 5 * time.Minute, Clear: 10 * time.Minute},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			rows, err := recentAPI(ctx, src, now, apiErrWindowMin)
			if err != nil || rows == nil {
				return Reading{Level: LevelUnknown}, err
			}
			requests, errs := 0, 0
			for _, m := range rows {
				requests, errs = requests+m.Requests, errs+m.Status5xx
			}
			level := errorLevel(requests, errs)
			if level == LevelOK {
				return Reading{Level: LevelOK}, nil
			}
			text := fmt.Sprintf("%d de %d pedidos da API com erro 5xx em 5 min (%s%%, limite %.0f%%)%s; veja o log no minuto: journalctl -u concord-server",
				errs, requests, decimal(100*float64(errs)/float64(requests), 1), 100*errorLimit(level), worstRoute(ctx, src, now))
			return Reading{Level: level, Text: text}, nil
		},
	}
}

func errorLevel(requests, errs int) Level {
	if errs < apiErrMinErrors || requests == 0 {
		return LevelOK
	}
	ratio := float64(errs) / float64(requests)
	switch {
	case ratio >= apiErrCritRatio && errs >= apiErrCritMin:
		return LevelCritical
	case ratio >= apiErrWarnRatio:
		return LevelWarning
	}
	return LevelOK
}

func errorLimit(level Level) float64 {
	if level == LevelCritical {
		return apiErrCritRatio
	}
	return apiErrWarnRatio
}

// recentAPI: as linhas dos últimos minutes minutos, se a mais nova for recente
// (nil = sem dado).
func recentAPI(ctx context.Context, src apiSource, now time.Time, minutes int) ([]serverobs.APIMinute, error) {
	rows, err := src.RecentAPI(ctx, minutes)
	if err != nil || len(rows) == 0 || now.Sub(rows[len(rows)-1].Minute) > freshFor {
		return nil, err
	}
	return rows, nil
}

// worstRoute: "; a rota que mais errou: GET /api/x (12)" ("" sem rota com 5xx).
func worstRoute(ctx context.Context, src apiSource, now time.Time) string {
	routes, err := src.Routes(ctx, now.Add(-routeLookback), now, 1)
	if err != nil || len(routes) == 0 || routes[0].Status5xx == 0 {
		return ""
	}
	return fmt.Sprintf("; a rota que mais errou: %s (%d)", routes[0].Route, routes[0].Status5xx)
}

func apiPanicsRule(src apiSource) Rule {
	return Rule{
		ID: "api_panics", Title: "Panic no backend", Channel: ChannelInfra, Tab: "erros",
		Hold: Hold{Clear: panicClearFor},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			rows, err := recentAPI(ctx, src, now, panicWindowMin)
			if err != nil || rows == nil {
				return Reading{Level: LevelUnknown}, err
			}
			n := 0
			for _, m := range rows {
				n += m.Panics
			}
			if n == 0 {
				return Reading{Level: LevelOK}, nil
			}
			return Reading{Level: LevelWarning, Text: fmt.Sprintf(
				"%d panic(s) no backend em 15 min: o pedido caiu com 500 e o processo seguiu; a pilha está na aba Erros (origem backend) e no journalctl -u concord-server", n)}, nil
		},
	}
}

func apiSlowRule(src apiSource) Rule {
	return Rule{
		ID: "api_slow", Title: "API lenta", Channel: ChannelInfra, Tab: "servidor",
		Hold: Hold{Warning: 5 * time.Minute, Critical: 10 * time.Minute, Clear: 5 * time.Minute},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			m, err := freshAPI(ctx, src, now)
			if err != nil || m == nil {
				return Reading{Level: LevelUnknown}, err
			}
			if m.Requests < apiSlowMinReqs || m.P95Ms == nil {
				return Reading{Level: LevelOK}, nil
			}
			r := levelFor(*m.P95Ms, limits{apiSlowWarnMs, apiSlowCritMs}, "p95 da API em %.0f ms (limite %.0f ms)")
			if r.Level != LevelOK {
				r.Text += slowestRoute(ctx, src, now) + slowHint(*m)
			}
			return r, nil
		},
	}
}

// slowestRoute: "; a rota mais lenta: GET /api/x (p95 3200 ms)" (só rota com 5+ pedidos).
func slowestRoute(ctx context.Context, src apiSource, now time.Time) string {
	routes, err := src.Routes(ctx, now.Add(-routeLookback), now, routeTop)
	if err != nil {
		return ""
	}
	var worst *serverobs.RouteRow
	for i, r := range routes {
		if r.P95Ms != nil && r.Requests >= 5 && (worst == nil || *r.P95Ms > *worst.P95Ms) {
			worst = &routes[i]
		}
	}
	if worst == nil {
		return ""
	}
	return fmt.Sprintf("; a rota mais lenta: %s (p95 %.0f ms)", worst.Route, *worst.P95Ms)
}

// slowHint: onde olhar, pelo pool do banco.
func slowHint(m serverobs.APIMinute) string {
	if m.DBWaits > 0 {
		return "; há espera por conexão do banco: veja as consultas lentas"
	}
	return "; sem espera no banco: veja a CPU da máquina (aba Servidor)"
}
