package alert

import (
	"time"

	"gin-quickstart/backend/internal/serverobs"
)

// Disco da pasta de dados (host_metrics.disk_used_pct e inodes_used_pct, do
// statfs de OBS_DISK_PATH: /opt/concord na VPS, com o banco, os uploads e os
// backups). O OBSERVABILIDADE.md trata 85% como "disco enchendo"; o aviso vem
// antes, em 80%, para dar tempo de limpar. Crítico em 90%: com o disco cheio o
// Postgres para de gravar e o app cai para todo mundo. O disco muda devagar:
// 15 min para avisar (o backup cria o arquivo novo antes de apagar o velho) e
// 30 min abaixo para normalizar (não pisca em volta do limite).
const (
	diskWarn     = 80
	diskCrit     = 90
	diskWarnFor  = 15 * time.Minute
	diskCritFor  = 10 * time.Minute
	diskClearFor = 30 * time.Minute
)

var diskHold = Hold{Warning: diskWarnFor, Critical: diskCritFor, Clear: diskClearFor}

func hostDiskRule(src hostSource) Rule {
	return Rule{
		ID: "host_disk", Title: "Disco da máquina", Channel: ChannelInfra, Tab: "servidor", Hold: diskHold,
		Check: hostCheck(src, func(h serverobs.HostMinute) *float64 { return h.DiskUsedPct }, limits{diskWarn, diskCrit},
			"disco da pasta de dados em %.0f%% (limite %.0f%%); veja o que cresceu: du -sh /opt/concord/*"),
	}
}

func hostInodesRule(src hostSource) Rule {
	return Rule{
		ID: "host_inodes", Title: "Inodes do disco", Channel: ChannelInfra, Tab: "servidor", Hold: diskHold,
		Check: hostCheck(src, func(h serverobs.HostMinute) *float64 { return h.InodesUsedPct }, limits{diskWarn, diskCrit},
			"inodes do disco em %.0f%% (limite %.0f%%): arquivos pequenos demais, mesmo com espaço sobrando; procure a pasta com mais arquivos: du --inodes -s /opt/concord/*"),
	}
}
