package hoststats

import (
	"path/filepath"
	"time"
)

// raw: uma leitura do /proc (contadores acumulados e valores do agora).
type raw struct {
	at      time.Time
	cpu     *cpuTimes
	boot    *time.Time
	load    *Load
	mem     *Memory
	disk    *DiskSpace
	diskIO  *diskCounters
	netName string
	net     *netCounters
	udp     *UDP
	self    *uint64
	selfMem *processMemory
	pg      map[string]uint64
	pgMem   *processMemory
}

func (m *MachineReader) collect() raw {
	r := raw{at: m.now()}
	if stat, err := m.read("/proc/stat"); err == nil {
		r.cpu, r.boot = opt(parseCPU(stat)), opt(parseBootTime(stat))
	}
	r.load = parseWith(m.read, "/proc/loadavg", parseLoadAvg)
	r.mem = parseWith(m.read, "/proc/meminfo", parseMemory)
	r.udp = parseWith(m.read, "/proc/net/snmp", parseUDP)
	r.disk = opt(m.statfs(m.diskPath))
	r.diskIO = m.diskCounters()
	r.netName, r.net = m.netCounters()
	r.self = parseWith(m.read, "/proc/self/stat", parseProcessTicks)
	if status, err := m.read("/proc/self/status"); err == nil {
		r.selfMem = ptr(parseProcessMemory(status))
	}
	r.pg, r.pgMem = m.postgres()
	return r
}

func parseWith[T any](read func(string) ([]byte, error), path string, parse func([]byte) (T, error)) *T {
	data, err := read(path)
	if err != nil {
		return nil
	}
	return opt(parse(data))
}

func (m *MachineReader) diskCounters() *diskCounters {
	abs, err := filepath.Abs(m.diskPath)
	mounts, err2 := m.read("/proc/self/mountinfo")
	stats, err3 := m.read("/proc/diskstats")
	if err != nil || err2 != nil || err3 != nil {
		return nil
	}
	dev, source := mountOf(mounts, abs)
	c, ok := parseDiskstats(stats, dev, source)
	if !ok {
		return nil
	}
	return &c
}

func (m *MachineReader) netCounters() (string, *netCounters) {
	dev, err := m.read("/proc/net/dev")
	if err != nil {
		return "", nil
	}
	route, _ := m.read("/proc/net/route")
	name, c := pickInterface(parseNetDev(dev), defaultRouteInterface(route))
	if name == "" {
		return "", nil
	}
	return name, &c
}

// postgres: ticks de cada processo "postgres" e a memória somada: a parte
// privada (RssAnon) de todos mais a maior compartilhada (RssShmem, o
// shared_buffers, que cada processo conta de novo).
func (m *MachineReader) postgres() (map[string]uint64, *processMemory) {
	names, err := m.list("/proc")
	if err != nil {
		return nil, nil
	}
	ticks := map[string]uint64{}
	var mem processMemory
	for _, pid := range names {
		t, pm, ok := m.postgresProcess(pid)
		if !ok {
			continue
		}
		ticks[pid] = t
		mem.anonKB += pm.anonKB
		mem.shmemKB = max(mem.shmemKB, pm.shmemKB)
	}
	if len(ticks) == 0 {
		return nil, nil
	}
	return ticks, &mem
}

func (m *MachineReader) postgresProcess(pid string) (uint64, processMemory, bool) {
	if !atoi(pid) {
		return 0, processMemory{}, false
	}
	comm, err := m.read("/proc/" + pid + "/comm")
	if err != nil || string(comm) != "postgres\n" {
		return 0, processMemory{}, false
	}
	stat, err := m.read("/proc/" + pid + "/stat")
	status, err2 := m.read("/proc/" + pid + "/status")
	if err != nil || err2 != nil {
		return 0, processMemory{}, false
	}
	t, err := parseProcessTicks(stat)
	return t, parseProcessMemory(status), err == nil
}
