package hoststats

// machineOf: os valores do agora e as diferenças desde prev (nil na primeira).
func machineOf(prev *raw, now raw) Machine {
	out := Machine{Load: now.load, Memory: now.mem, Disk: now.disk, BootAt: now.boot}
	out.Backend = selfProcess(prev, now)
	out.Postgres = postgresProcess(prev, now)
	if prev == nil {
		return out
	}
	secs := now.at.Sub(prev.at).Seconds()
	if secs <= 0 {
		return out
	}
	out.Seconds = secs
	out.CPU = cpuDelta(prev.cpu, now.cpu)
	out.DiskIO = diskDelta(prev.diskIO, now.diskIO, secs)
	out.Net = netDelta(prev, now, secs)
	out.UDP = udpDelta(prev.udp, now.udp)
	return out
}

// grew: now − prev, falso se o contador voltou (reinício, troca de interface).
func grew(prev, now uint64) (float64, bool) {
	if now < prev {
		return 0, false
	}
	return float64(now - prev), true
}

func cpuDelta(prev, now *cpuTimes) *CPU {
	if prev == nil || now == nil || now.total <= prev.total {
		return nil
	}
	total := float64(now.total - prev.total)
	busy, ok1 := grew(prev.busy, now.busy)
	iowait, ok2 := grew(prev.iowait, now.iowait)
	steal, ok3 := grew(prev.steal, now.steal)
	if !ok1 || !ok2 || !ok3 {
		return nil
	}
	return &CPU{Percent: busy * 100 / total, IOWaitPercent: iowait * 100 / total, StealPercent: steal * 100 / total}
}

func diskDelta(prev, now *diskCounters, secs float64) *DiskIO {
	if prev == nil || now == nil {
		return nil
	}
	read, ok1 := grew(prev.readSectors, now.readSectors)
	write, ok2 := grew(prev.writeSectors, now.writeSectors)
	io, ok3 := grew(prev.ioMs, now.ioMs)
	if !ok1 || !ok2 || !ok3 {
		return nil
	}
	return &DiskIO{ReadBytesPerSec: read * sectorBytes / secs, WriteBytesPerSec: write * sectorBytes / secs,
		BusyPercent: min(io/(secs*10), 100)}
}

func netDelta(prev *raw, now raw, secs float64) *Net {
	p, n := prev.net, now.net
	if p == nil || n == nil || prev.netName != now.netName {
		return nil
	}
	rx, ok1 := grew(p.rxBytes, n.rxBytes)
	tx, ok2 := grew(p.txBytes, n.txBytes)
	rxp, ok3 := grew(p.rxPackets, n.rxPackets)
	txp, ok4 := grew(p.txPackets, n.txPackets)
	errs, ok5 := grew(p.errors, n.errors)
	drops, ok6 := grew(p.drops, n.drops)
	if !ok1 || !ok2 || !ok3 || !ok4 || !ok5 || !ok6 {
		return nil
	}
	return &Net{Interface: now.netName, RxBytesPerSec: rx / secs, TxBytesPerSec: tx / secs,
		RxPacketsPerSec: rxp / secs, TxPacketsPerSec: txp / secs, Errors: uint64(errs), Drops: uint64(drops)}
}

func udpDelta(prev, now *UDP) *UDP {
	if prev == nil || now == nil {
		return nil
	}
	in, ok1 := grew(prev.InErrors, now.InErrors)
	rcv, ok2 := grew(prev.RcvbufErrors, now.RcvbufErrors)
	snd, ok3 := grew(prev.SndbufErrors, now.SndbufErrors)
	if !ok1 || !ok2 || !ok3 {
		return nil
	}
	return &UDP{InErrors: uint64(in), RcvbufErrors: uint64(rcv), SndbufErrors: uint64(snd)}
}

// share: ticks do processo sobre os ticks de todas as vCPUs no intervalo.
func share(ticks float64, prev *raw, now raw) *float64 {
	if prev == nil || prev.cpu == nil || now.cpu == nil || now.cpu.total <= prev.cpu.total {
		return nil
	}
	return ptr(ticks * 100 / float64(now.cpu.total-prev.cpu.total))
}

func selfProcess(prev *raw, now raw) *Process {
	if now.selfMem == nil {
		return nil
	}
	p := &Process{MemMB: float64(now.selfMem.rssKB) / 1024}
	if prev != nil && prev.self != nil && now.self != nil {
		if d, ok := grew(*prev.self, *now.self); ok {
			p.CPUPercent = share(d, prev, now)
		}
	}
	return p
}

// postgresProcess: processo novo conta o tempo todo (nasceu no intervalo);
// o que terminou no meio do intervalo perde o último pedaço.
func postgresProcess(prev *raw, now raw) *Process {
	if now.pgMem == nil {
		return nil
	}
	p := &Process{MemMB: float64(now.pgMem.anonKB+now.pgMem.shmemKB) / 1024}
	if prev == nil || prev.pgMem == nil {
		return p
	}
	var ticks float64
	for pid, t := range now.pg {
		if d, ok := grew(prev.pg[pid], t); ok {
			ticks += d
		}
	}
	p.CPUPercent = share(ticks, prev, now)
	return p
}
