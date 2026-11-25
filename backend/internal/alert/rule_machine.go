package alert

import (
	"context"
	"fmt"
	"time"

	"gin-quickstart/backend/internal/serverobs"
)

// A máquina além de CPU e memória (host_metrics):
//
//   - swap crescendo: 512 MB em uso e +256 MB em 30 min = a RAM não dá conta e
//     o disco virou memória (tudo fica lento antes de o kernel matar alguém).
//     Swap parado, mesmo alto, não avisa: é memória fria.
//   - steal: CPU que o hipervisor deu a outra VPS. O OBSERVABILIDADE.md trata
//     > 10% por vários minutos como "vizinho barulhento"; 10 min seguidos.
//   - UDP: erros de buffer do kernel (RcvbufErrors + SndbufErrors) = pacotes
//     de voz e vídeo descartados na própria VPS. Em 30/10/2026 eram 10 em 5
//     dias, sem efeito; 100 em 5 min é outra ordem de grandeza. Hold de 8 min
//     (maior que a janela): um estouro de um minuto só não basta.
const (
	swapMinMB      = 512
	swapGrowMB     = 256
	swapWindowMin  = 30
	swapMinHistory = 25 * time.Minute

	stealWarn = 10

	udpWindowMin = 5
	udpErrors    = 100
)

func hostSwapRule(src hostSource) Rule {
	return Rule{
		ID: "host_swap", Title: "Swap crescendo", Channel: ChannelInfra, Tab: "servidor",
		Hold: Hold{Warning: 10 * time.Minute, Clear: 30 * time.Minute},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			rows, err := recentHost(ctx, src, now, swapWindowMin+5)
			if err != nil || rows == nil {
				return Reading{Level: LevelUnknown}, err
			}
			first, last := rows[0], rows[len(rows)-1]
			if last.Minute.Sub(first.Minute) < swapMinHistory || first.SwapUsedMB == nil || last.SwapUsedMB == nil {
				return Reading{Level: LevelUnknown}, nil
			}
			used, grew := *last.SwapUsedMB, *last.SwapUsedMB-*first.SwapUsedMB
			if used < swapMinMB || grew < swapGrowMB {
				return Reading{Level: LevelOK}, nil
			}
			return Reading{Level: LevelWarning, Text: fmt.Sprintf(
				"swap em %.0f MB e subindo (+%.0f MB em 30 min; limite %d MB e +%d MB): a RAM não está dando conta e tudo fica lento; veja quem come a memória na aba Servidor",
				used, grew, swapMinMB, swapGrowMB)}, nil
		},
	}
}

func hostStealRule(src hostSource) Rule {
	return Rule{
		ID: "host_steal", Title: "CPU roubada pelo provedor (steal)", Channel: ChannelInfra, Tab: "servidor",
		Hold: Hold{Warning: 10 * time.Minute, Clear: 10 * time.Minute},
		Check: hostCheck(src, func(h serverobs.HostMinute) *float64 { return h.StealPct }, limits{warn: stealWarn},
			"steal da CPU em %.0f%% (limite %.0f%%): o provedor está dando a CPU desta VPS para outras; se durar, abra chamado ou troque de host"),
	}
}

func udpBufferRule(src hostSource) Rule {
	return Rule{
		ID: "udp_buffer", Title: "Buffer de UDP estourando", Channel: ChannelInfra, Tab: "servidor",
		Hold: Hold{Warning: 8 * time.Minute, Clear: 15 * time.Minute},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			rows, err := recentHost(ctx, src, now, udpWindowMin)
			if err != nil || rows == nil {
				return Reading{Level: LevelUnknown}, err
			}
			n := udpBufferErrors(rows)
			if n < udpErrors {
				return Reading{Level: LevelOK}, nil
			}
			return Reading{Level: LevelWarning, Text: fmt.Sprintf(
				"%d erros de buffer UDP do kernel em 5 min (limite %d): pacotes de voz e vídeo descartados na VPS; aumente net.core.rmem_max e wmem_max (OBSERVABILIDADE.md, nota do LiveKit)",
				n, udpErrors)}, nil
		},
	}
}

func udpBufferErrors(rows []serverobs.HostMinute) int64 {
	var n int64
	for _, h := range rows {
		if h.UDPRcvbufErrors != nil {
			n += *h.UDPRcvbufErrors
		}
		if h.UDPSndbufErrors != nil {
			n += *h.UDPSndbufErrors
		}
	}
	return n
}

// recentHost: as linhas dos últimos minutes minutos, se a mais nova for
// recente (nil = sem dado).
func recentHost(ctx context.Context, src hostSource, now time.Time, minutes int) ([]serverobs.HostMinute, error) {
	rows, err := src.RecentHost(ctx, minutes)
	if err != nil || len(rows) == 0 || now.Sub(rows[len(rows)-1].Minute) > freshFor {
		return nil, err
	}
	return rows, nil
}
