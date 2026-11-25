package serverobs

import "gin-quickstart/backend/internal/platform/hoststats"

// hostRow: a leitura da máquina nas colunas de host_metrics (nil fica nulo).
func hostRow(m hoststats.Machine) HostMinute {
	row := HostMinute{Seconds: m.Seconds, BootAt: m.BootAt}
	fillCPU(&row, m)
	fillDisk(&row, m)
	fillNet(&row, m)
	row.BackendCPUPct, row.BackendMemMB = processCols(m.Backend)
	row.PostgresCPUPct, row.PostgresMemMB = processCols(m.Postgres)
	return row
}

func ptr[T any](v T) *T { return &v }

func i64(v uint64) *int64 { return ptr(int64(v)) }

func fillCPU(row *HostMinute, m hoststats.Machine) {
	if c := m.CPU; c != nil {
		row.CPUPct, row.IOWaitPct, row.StealPct = ptr(c.Percent), ptr(c.IOWaitPercent), ptr(c.StealPercent)
	}
	if l := m.Load; l != nil {
		row.Load1, row.Load5, row.Load15 = ptr(l.One), ptr(l.Five), ptr(l.Fifteen)
	}
	if mem := m.Memory; mem != nil {
		row.MemUsedPct, row.MemAvailableMB, row.SwapUsedMB = ptr(mem.UsedPercent), ptr(mem.AvailableMB), ptr(mem.SwapUsedMB)
	}
}

func fillDisk(row *HostMinute, m hoststats.Machine) {
	if d := m.Disk; d != nil {
		row.DiskUsedBytes, row.DiskFreeBytes = i64(d.UsedBytes), i64(d.FreeBytes)
		row.DiskUsedPct, row.InodesUsedPct = ptr(d.UsedPercent), d.InodesUsedPercent
	}
	if io := m.DiskIO; io != nil {
		row.DiskReadBps, row.DiskWriteBps, row.DiskBusyPct = ptr(io.ReadBytesPerSec), ptr(io.WriteBytesPerSec), ptr(io.BusyPercent)
	}
}

func fillNet(row *HostMinute, m hoststats.Machine) {
	if n := m.Net; n != nil {
		row.NetRxBps, row.NetTxBps = ptr(n.RxBytesPerSec), ptr(n.TxBytesPerSec)
		row.NetRxPps, row.NetTxPps = ptr(n.RxPacketsPerSec), ptr(n.TxPacketsPerSec)
		row.NetErrors, row.NetDrops = i64(n.Errors), i64(n.Drops)
	}
	if u := m.UDP; u != nil {
		row.UDPInErrors, row.UDPRcvbufErrors, row.UDPSndbufErrors = i64(u.InErrors), i64(u.RcvbufErrors), i64(u.SndbufErrors)
	}
}

func processCols(p *hoststats.Process) (*float64, *float64) {
	if p == nil {
		return nil, nil
	}
	return p.CPUPercent, ptr(p.MemMB)
}
