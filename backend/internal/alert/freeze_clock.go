package alert

import (
	"os"
	"strconv"
	"strings"
	"time"
)

// Os relógios que o vigia do congelamento compara.

// rtcPath: o relógio de hardware em segundos UTC. Numa VM, quem o mantém é o
// hipervisor: ele segue andando enquanto a VM está pausada, e o relógio do
// sistema não.
const (
	rtcPath     = "/sys/class/rtc/rtc0/since_epoch"
	adjtimePath = "/etc/adjtime"
)

// clockReading: o relógio de parede (sem a leitura monotônica) e quanto o
// monotônico andou desde o começo.
type clockReading struct {
	wall time.Time
	mono time.Duration
}

// systemClock: o relógio do processo (time.Now carrega as duas leituras).
func systemClock() func() clockReading {
	start := time.Now()
	return func() clockReading {
		now := time.Now()
		return clockReading{wall: now.Round(0), mono: now.Sub(start)}
	}
}

// readRTC: o relógio de hardware; false sem o arquivo (dev, Windows, contêiner)
// ou com ele na hora local (o /etc/adjtime diz LOCAL), que daria horas de
// diferença sem congelamento nenhum.
func readRTC(read func(string) ([]byte, error)) (time.Time, bool) {
	if adj, err := read(adjtimePath); err == nil && strings.Contains(string(adj), "LOCAL") {
		return time.Time{}, false
	}
	raw, err := read(rtcPath)
	if err != nil {
		return time.Time{}, false
	}
	secs, err := strconv.ParseInt(strings.TrimSpace(string(raw)), 10, 64)
	if err != nil || secs <= 0 {
		return time.Time{}, false
	}
	return time.Unix(secs, 0), true
}

// hardwareClock: readRTC no sistema de arquivos de verdade.
func hardwareClock() (time.Time, bool) {
	return readRTC(os.ReadFile)
}
