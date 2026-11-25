package hoststats

import (
	"os"
	"strconv"
	"sync"
	"time"
)

// Machine: a VPS num minuto (host_metrics). Cada parte é nil quando a
// leitura falha (ou fora do Linux); as taxas são nil na primeira leitura.
type Machine struct {
	// Seconds: intervalo desde a leitura anterior (0 na primeira).
	Seconds  float64
	CPU      *CPU
	Load     *Load
	Memory   *Memory
	Disk     *DiskSpace
	DiskIO   *DiskIO
	Net      *Net
	UDP      *UDP // erros no intervalo
	Backend  *Process
	Postgres *Process
	BootAt   *time.Time
}

// CPU: % da máquina inteira (todas as vCPUs) no intervalo.
type CPU struct{ Percent, IOWaitPercent, StealPercent float64 }

// DiskIO: do disco da pasta de dados, no intervalo.
type DiskIO struct{ ReadBytesPerSec, WriteBytesPerSec, BusyPercent float64 }

// Net: da interface principal, no intervalo.
type Net struct {
	Interface                                                      string
	RxBytesPerSec, TxBytesPerSec, RxPacketsPerSec, TxPacketsPerSec float64
	Errors, Drops                                                  uint64
}

// Process: CPU em % da máquina inteira (nil na primeira leitura) e memória.
type Process struct {
	CPUPercent *float64
	MemMB      float64
}

// MachineReader lê a máquina e guarda a leitura anterior (contadores do /proc
// são acumulados).
type MachineReader struct {
	mu       sync.Mutex
	read     func(string) ([]byte, error)
	list     func(string) ([]string, error)
	statfs   func(string) (DiskSpace, error)
	now      func() time.Time
	diskPath string
	prev     *raw
}

// NewMachine: diskPath é a pasta cujo disco (espaço e E/S) interessa.
func NewMachine(diskPath string) *MachineReader {
	return &MachineReader{read: os.ReadFile, list: listDir, statfs: statfs, now: time.Now, diskPath: diskPath}
}

func listDir(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	return names, err
}

// Read nunca falha: o que não deu para ler fica nil.
func (m *MachineReader) Read() Machine {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := m.collect()
	out := machineOf(m.prev, now)
	m.prev = &now
	return out
}

// opt: o valor, ou nil se a leitura falhou.
func opt[T any](v T, err error) *T {
	if err != nil {
		return nil
	}
	return &v
}

func ptr[T any](v T) *T { return &v }

func atoi(s string) bool {
	_, err := strconv.Atoi(s)
	return err == nil
}
