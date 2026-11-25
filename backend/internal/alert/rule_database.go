package alert

import (
	"context"
	"fmt"
	"time"
)

// Banco no limite: o pool do Postgres do backend (api_metrics.db_*, do
// pgxpool.Stat a cada minuto). db_waits = pedidos que acharam o pool cheio no
// minuto; db_wait_ms = quanto esperaram somados. O pool padrão do pgx tem
// max(4, vCPUs) conexões: espera de vez em quando é normal; 30 esperas ou 3 s
// esperando num minuto, ou o pool cheio com fila, por 5 min seguidos, é a API
// enfileirando atrás do banco. Aviso: o efeito para quem usa já aparece em
// "API lenta".
const (
	dbPoolWaits   = 30
	dbPoolWaitMs  = 3000
	dbPoolHoldFor = 5 * time.Minute
)

func dbPoolRule(src apiSource) Rule {
	return Rule{
		ID: "db_pool", Title: "Pool do banco no limite", Channel: ChannelInfra, Tab: "servidor",
		Hold: Hold{Warning: dbPoolHoldFor, Clear: dbPoolHoldFor},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			m, err := freshAPI(ctx, src, now)
			if err != nil || m == nil {
				return Reading{Level: LevelUnknown}, err
			}
			full := m.DBMax > 0 && m.DBInUse >= m.DBMax && m.DBWaits > 0
			if !full && m.DBWaits < dbPoolWaits && m.DBWaitMs < dbPoolWaitMs {
				return Reading{Level: LevelOK}, nil
			}
			return Reading{Level: LevelWarning, Text: fmt.Sprintf(
				"pool do banco no limite: %d de %d conexões em uso, %d esperas por conexão (%.0f ms esperando) no minuto (limite %d esperas ou %d ms); os pedidos fazem fila: veja as consultas lentas e o pool_max_conns do DATABASE_URL",
				m.DBInUse, m.DBMax, m.DBWaits, m.DBWaitMs, dbPoolWaits, dbPoolWaitMs)}, nil
		},
	}
}
