package hoststats

import (
	"errors"
	"math"
	"testing"
	"time"
)

func near(t *testing.T, what string, got *float64, want float64) {
	t.Helper()
	if got == nil || math.Abs(*got-want) > 0.01 {
		t.Errorf("%s = %v, quer %v", what, deref(got), want)
	}
}

func deref(v *float64) any {
	if v == nil {
		return nil
	}
	return *v
}

type fakeMachine struct {
	files map[string]string
	at    time.Time
}

func (f *fakeMachine) reader() *MachineReader {
	return &MachineReader{
		read: func(p string) ([]byte, error) {
			s, ok := f.files[p]
			if !ok {
				return nil, errors.New("sem arquivo")
			}
			return []byte(s), nil
		},
		list: func(string) ([]string, error) { return []string{"self", "1", "77", "88"}, nil },
		statfs: func(string) (DiskSpace, error) {
			return space(1000, 400, 300, 4096, 100, 25)
		},
		now:      func() time.Time { return f.at },
		diskPath: "/opt/concord",
	}
}

func firstFiles() map[string]string {
	return map[string]string{
		"/proc/stat":           "cpu  1000 0 0 8000 500 0 0 100 0 0\nbtime 1764000000\n",
		"/proc/loadavg":        "0.50 0.40 0.30 1/200 999\n",
		"/proc/meminfo":        "MemTotal: 4096000 kB\nMemAvailable: 2048000 kB\nSwapTotal: 0 kB\nSwapFree: 0 kB\n",
		"/proc/net/snmp":       "Udp: InErrors RcvbufErrors SndbufErrors\nUdp: 10 5 1\n",
		"/proc/self/mountinfo": "22 1 252:1 / / rw - ext4 /dev/vda1 rw\n",
		"/proc/diskstats":      " 252 1 vda1 0 0 1000 0 0 0 2000 0 0 100 0\n",
		"/proc/net/dev":        "h\nh\n  eth0: 1000 10 0 0 0 0 0 0 2000 20 0 0 0 0 0 0\n",
		"/proc/net/route":      "Iface Destination Gateway Flags RefCnt Use Metric Mask\neth0 00000000 0 3 0 0 0 00000000\n",
		"/proc/self/stat":      "5 (concord-server) S 1 1 1 0 -1 0 0 0 0 0 100 0 0 0 20 0 1 0 1 0 0\n",
		"/proc/self/status":    "VmRSS:\t102400 kB\n",
		"/proc/77/comm":        "postgres\n",
		"/proc/77/stat":        "77 (postgres) S 1 1 1 0 -1 0 0 0 0 0 50 0 0 0 20 0 1 0 1 0 0\n",
		"/proc/77/status":      "RssAnon:\t10240 kB\nRssShmem:\t20480 kB\n",
		"/proc/88/comm":        "caddy\n",
	}
}

func TestMachinePrimeiraLeituraSemTaxas(t *testing.T) {
	f := &fakeMachine{files: firstFiles(), at: time.Unix(1764000600, 0)}
	m := f.reader().Read()
	if m.Seconds != 0 || m.CPU != nil || m.Net != nil || m.DiskIO != nil || m.UDP != nil {
		t.Errorf("primeira = %+v, quer taxas nil", m)
	}
	if m.Load == nil || m.Load.One != 0.5 || m.Memory == nil || m.Memory.UsedPercent != 50 {
		t.Errorf("load/memória = %+v %+v", m.Load, m.Memory)
	}
	if m.BootAt == nil || !m.BootAt.Equal(time.Unix(1764000000, 0)) {
		t.Errorf("boot = %v", m.BootAt)
	}
	if m.Backend == nil || m.Backend.MemMB != 100 || m.Backend.CPUPercent != nil {
		t.Errorf("backend = %+v", m.Backend)
	}
	if m.Postgres == nil || m.Postgres.MemMB != 30 {
		t.Errorf("postgres = %+v, quer 30 MB (10 privados + 20 compartilhados)", m.Postgres)
	}
	if m.Disk == nil || m.Disk.FreeBytes != 300*4096 || *m.Disk.InodesUsedPercent != 75 {
		t.Errorf("disco = %+v", m.Disk)
	}
}

func TestMachineDiferencasEntreDuasLeituras(t *testing.T) {
	f := &fakeMachine{files: firstFiles(), at: time.Unix(1764000600, 0)}
	r := f.reader()
	r.Read()
	f.at = f.at.Add(time.Minute)
	// +1000 ticks no total: 600 ocupados (100 de steal), 200 de iowait, 200 ociosos.
	f.files["/proc/stat"] = "cpu  1500 0 0 8200 700 0 0 200 0 0\nbtime 1764000000\n"
	f.files["/proc/net/snmp"] = "Udp: InErrors RcvbufErrors SndbufErrors\nUdp: 12 8 1\n"
	f.files["/proc/diskstats"] = " 252 1 vda1 0 0 13000 0 0 0 14000 0 0 6100 0\n"
	f.files["/proc/net/dev"] = "h\nh\n  eth0: 61000 610 1 0 0 0 0 0 122000 1220 0 2 0 0 0 0\n"
	f.files["/proc/self/stat"] = "5 (concord-server) S 1 1 1 0 -1 0 0 0 0 0 150 0 0 0 20 0 1 0 1 0 0\n"
	f.files["/proc/77/stat"] = "77 (postgres) S 1 1 1 0 -1 0 0 0 0 0 80 0 0 0 20 0 1 0 1 0 0\n"
	f.files["/proc/88/comm"] = "postgres\n" // processo novo: conta todo o tempo dele
	f.files["/proc/88/stat"] = "88 (postgres) S 1 1 1 0 -1 0 0 0 0 0 20 0 0 0 20 0 1 0 1 0 0\n"
	f.files["/proc/88/status"] = "RssAnon:\t1024 kB\nRssShmem:\t2048 kB\n"
	m := r.Read()
	if m.Seconds != 60 || m.CPU == nil {
		t.Fatalf("segunda = %+v", m)
	}
	if m.CPU.Percent != 60 || m.CPU.IOWaitPercent != 20 || m.CPU.StealPercent != 10 {
		t.Errorf("cpu = %+v, quer 60/20/10", *m.CPU)
	}
	if m.DiskIO == nil || m.DiskIO.ReadBytesPerSec != 12000*512/60.0 || m.DiskIO.WriteBytesPerSec != 12000*512/60.0 || m.DiskIO.BusyPercent != 10 {
		t.Errorf("disco = %+v", m.DiskIO)
	}
	if m.Net == nil || m.Net.RxBytesPerSec != 1000 || m.Net.TxBytesPerSec != 2000 || m.Net.RxPacketsPerSec != 10 || m.Net.Errors != 1 || m.Net.Drops != 2 {
		t.Errorf("rede = %+v", m.Net)
	}
	if m.UDP == nil || *m.UDP != (UDP{InErrors: 2, RcvbufErrors: 3}) {
		t.Errorf("udp = %+v", m.UDP)
	}
	near(t, "cpu do backend", m.Backend.CPUPercent, 5)
	near(t, "cpu do postgres", m.Postgres.CPUPercent, 5)
	if m.Postgres.MemMB != 31 {
		t.Errorf("memória do postgres = %v, quer 31", m.Postgres.MemMB)
	}
}

func TestMachineContadorQueVoltaViraNil(t *testing.T) {
	f := &fakeMachine{files: firstFiles(), at: time.Unix(1764000600, 0)}
	r := f.reader()
	r.Read()
	f.at = f.at.Add(time.Minute)
	f.files["/proc/net/snmp"] = "Udp: InErrors RcvbufErrors SndbufErrors\nUdp: 0 0 0\n"
	f.files["/proc/net/dev"] = "h\nh\n  ens4: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0\n"
	if m := r.Read(); m.UDP != nil || m.Net != nil {
		t.Errorf("udp = %+v rede = %+v, quer nil (reinício / outra interface)", m.UDP, m.Net)
	}
}

func TestMachineSemProcNaoQuebra(t *testing.T) {
	f := &fakeMachine{files: map[string]string{}, at: time.Unix(1, 0)}
	r := f.reader()
	r.list = func(string) ([]string, error) { return nil, errors.New("sem /proc") }
	r.statfs = func(string) (DiskSpace, error) { return DiskSpace{}, errors.New("não") }
	r.Read()
	f.at = f.at.Add(time.Minute)
	m := r.Read()
	if m.CPU != nil || m.Load != nil || m.Memory != nil || m.Disk != nil || m.Net != nil || m.Backend != nil || m.Postgres != nil || m.BootAt != nil {
		t.Errorf("sem /proc = %+v, quer tudo nil", m)
	}
}

func TestSpaceComoODf(t *testing.T) {
	s, err := space(1000, 400, 300, 1, 0, 0)
	if err != nil || s.UsedBytes != 600 || s.FreeBytes != 300 || math.Abs(s.UsedPercent-66.67) > 0.01 || s.InodesUsedPercent != nil {
		t.Errorf("espaço = %+v, %v", s, err)
	}
	if _, err := space(0, 0, 0, 4096, 0, 0); err == nil {
		t.Error("quer erro sem blocos")
	}
}

func TestStatfsDaPastaAtual(t *testing.T) {
	if _, err := statfs("."); err != nil {
		t.Skipf("sem statfs aqui: %v", err)
	}
}
