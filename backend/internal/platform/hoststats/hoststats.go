// Package hoststats lê CPU e memória da máquina (/proc, Linux) para a
// observabilidade do servidor. Fora do Linux, Read devolve erro e o coletor
// grava a linha sem esses números.
package hoststats

import (
	"errors"
	"fmt"
	"os"
	"sync"
)

var errFormat = errors.New("hoststats: formato inesperado")

// Snapshot: CPU da máquina inteira (todas as vCPUs) desde a leitura anterior
// e memória em uso agora.
type Snapshot struct {
	// CPUPercent: nil na primeira leitura (não há intervalo).
	CPUPercent     *float64
	MemUsedPercent float64
}

// Reader guarda a leitura anterior da CPU (o /proc/stat é acumulado).
type Reader struct {
	mu   sync.Mutex
	read func(string) ([]byte, error)
	prev *cpuTimes
}

func New() *Reader {
	return &Reader{read: os.ReadFile}
}

func (r *Reader) Read() (Snapshot, error) {
	stat, err := r.read("/proc/stat")
	if err != nil {
		return Snapshot{}, fmt.Errorf("hoststats: /proc/stat: %w", err)
	}
	now, err := parseCPU(stat)
	if err != nil {
		return Snapshot{}, err
	}
	mem, err := r.read("/proc/meminfo")
	if err != nil {
		return Snapshot{}, fmt.Errorf("hoststats: /proc/meminfo: %w", err)
	}
	used, err := parseMemUsed(mem)
	if err != nil {
		return Snapshot{}, err
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	snap := Snapshot{CPUPercent: cpuPercent(r.prev, now), MemUsedPercent: used}
	r.prev = &now
	return snap, nil
}

func cpuPercent(prev *cpuTimes, now cpuTimes) *float64 {
	if prev == nil || now.total <= prev.total {
		return nil
	}
	pct := float64(now.busy-prev.busy) * 100 / float64(now.total-prev.total)
	return &pct
}
