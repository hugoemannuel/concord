package alert

import (
	"context"
	"fmt"
	"time"
)

// Backup atrasado ou encolhido (host_metrics.backup_at e backup_bytes: o
// arquivo concord-*.sql.gz mais novo de OBS_BACKUP_DIR). O
// concord-backup.timer roda todo dia, com até 1 h de atraso aleatório:
// mais de 26 h sem arquivo novo = não rodou, ou rodou e não gerou arquivo (o
// "falhou" do systemd sai pela regra unit_failed; esta pega o resto). Menos da
// metade do anterior = o pg_dump saiu pela metade (o banco só cresce: a
// retenção de 14 dias apaga a telemetria, que se repõe no mesmo ritmo). Aviso
// só: ninguém fica sem o app por isso.
const (
	backupMaxAge = 26 * time.Hour
	// backupShrink: o novo com menos que isso do anterior é suspeito.
	backupShrink = 0.5
	// backupMinBytes: abaixo disso o anterior é pequeno demais para comparar (dev).
	backupMinBytes = 1 << 20
	backupHoldFor  = 10 * time.Minute
)

// Backup: um arquivo de backup visto pela coleta.
type Backup struct {
	At    time.Time
	Bytes int64
}

type backupSource interface {
	// PreviousBackup: o backup que a coleta via antes do de before (nil = nenhum).
	PreviousBackup(ctx context.Context, before time.Time) (*Backup, error)
}

func backupRule(host hostSource, prev backupSource) Rule {
	b := &backupCheck{host: host, prev: prev}
	return Rule{
		ID: "backup_late", Title: "Backup do banco", Channel: ChannelInfra, Tab: "servidor",
		Hold:  Hold{Warning: backupHoldFor, Clear: backupHoldFor},
		Check: b.check,
	}
}

// backupCheck guarda o backup anterior do último arquivo visto: a consulta só
// roda quando aparece um arquivo novo (uma vez por dia).
type backupCheck struct {
	host hostSource
	prev backupSource

	seen     time.Time
	previous *Backup
}

func (b *backupCheck) check(ctx context.Context, now time.Time) (Reading, error) {
	h, err := freshHost(ctx, b.host, now)
	if err != nil || h == nil || h.BackupAt == nil || h.BackupBytes == nil {
		return Reading{Level: LevelUnknown}, err
	}
	last := Backup{At: *h.BackupAt, Bytes: *h.BackupBytes}
	if age := now.Sub(last.At); age > backupMaxAge {
		return Reading{Level: LevelWarning, Text: fmt.Sprintf(
			"o backup mais novo do banco é de %s (há %s, limite 26 h): o concord-backup não rodou ou não gerou o arquivo; veja systemctl list-timers concord-backup.timer e journalctl -u concord-backup -n 50",
			clock(last.At, now), duration(age))}, nil
	}
	previous, err := b.previousOf(ctx, last.At)
	if err != nil {
		return Reading{Level: LevelUnknown}, err
	}
	if shrunk(last, previous) {
		return Reading{Level: LevelWarning, Text: fmt.Sprintf(
			"o backup do banco de %s tem %s, menos da metade do anterior (%s): o pg_dump pode ter saído pela metade; confira o fim do arquivo com zcat <arquivo> | tail -3",
			clock(last.At, now), megabytes(last.Bytes), megabytes(previous.Bytes))}, nil
	}
	return Reading{Level: LevelOK}, nil
}

func (b *backupCheck) previousOf(ctx context.Context, at time.Time) (*Backup, error) {
	if at.Equal(b.seen) {
		return b.previous, nil
	}
	previous, err := b.prev.PreviousBackup(ctx, at)
	if err != nil {
		return nil, err
	}
	b.seen, b.previous = at, previous
	return previous, nil
}

func shrunk(last Backup, previous *Backup) bool {
	return previous != nil && previous.Bytes >= backupMinBytes && float64(last.Bytes) < backupShrink*float64(previous.Bytes)
}

// megabytes: "312 MB" (ou "0,4 MB").
func megabytes(n int64) string {
	mb := float64(n) / (1 << 20)
	if mb < 10 {
		return decimal(mb, 1) + " MB"
	}
	return fmt.Sprintf("%.0f MB", mb)
}

// decimal: o número com vírgula ("2,5").
func decimal(v float64, places int) string {
	s := fmt.Sprintf("%.*f", places, v)
	for i := range s {
		if s[i] == '.' {
			return s[:i] + "," + s[i+1:]
		}
	}
	return s
}
