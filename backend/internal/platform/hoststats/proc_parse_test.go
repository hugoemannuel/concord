package hoststats

import (
	"testing"
	"time"
)

func TestParseCPUSeparaIowaitEStealSemContarGuest(t *testing.T) {
	// user nice system idle iowait irq softirq steal guest guest_nice
	got, err := parseCPU([]byte("cpu  100 0 50 700 30 0 0 20 40 0\n"))
	if err != nil {
		t.Fatal(err)
	}
	want := cpuTimes{busy: 170, total: 900, iowait: 30, steal: 20}
	if got != want {
		t.Errorf("cpu = %+v, quer %+v (guest já está no user)", got, want)
	}
}

func TestParseBootTime(t *testing.T) {
	at, err := parseBootTime([]byte("cpu  1 2 3 4\nintr 1\nbtime 1764000000\nprocesses 9\n"))
	if err != nil || !at.Equal(time.Unix(1764000000, 0)) {
		t.Errorf("btime = %v, %v", at, err)
	}
	if _, err := parseBootTime([]byte("cpu 1\n")); err == nil {
		t.Error("quer erro sem btime")
	}
}

func TestParseLoadAvg(t *testing.T) {
	got, err := parseLoadAvg([]byte("0.52 1.10 0.98 2/301 12345\n"))
	if err != nil || got != (Load{One: 0.52, Five: 1.10, Fifteen: 0.98}) {
		t.Errorf("load = %+v, %v", got, err)
	}
	if _, err := parseLoadAvg([]byte("x\n")); err == nil {
		t.Error("quer erro")
	}
}

func TestParseMemory(t *testing.T) {
	got, err := parseMemory([]byte("MemTotal: 4096000 kB\nMemAvailable: 1024000 kB\nSwapTotal: 2048000 kB\nSwapFree: 1536000 kB\n"))
	if err != nil {
		t.Fatal(err)
	}
	if got != (Memory{UsedPercent: 75, AvailableMB: 1000, SwapUsedMB: 500}) {
		t.Errorf("memória = %+v", got)
	}
}

const netDev = `Inter-|   Receive                                                |  Transmit
 face |bytes    packets errs drop fifo frame compressed multicast|bytes    packets errs drop fifo colls carrier compressed
    lo: 9999999   99999    0    0    0     0          0         0  9999999   99999    0    0    0     0       0          0
  eth0: 1000000    2000    1    2    0     0          0         0  3000000    4000    3    4    0     0       0          0
docker0: 50000000  9000    0    0    0     0          0         0 50000000   9000    0    0    0     0       0          0
br-1a2b: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0
vethab12: 1 1 0 0 0 0 0 0 1 1 0 0 0 0 0 0
  ens4: 10 1 0 0 0 0 0 0 10 1 0 0 0 0 0 0
`

const netRoute = "Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT\n" +
	"docker0\t000011AC\t00000000\t0001\t0\t0\t0\t0000FFFF\t0\t0\t0\n" +
	"ens4\t00000000\t0101A8C0\t0003\t0\t0\t100\t00000000\t0\t0\t0\n"

func TestNetPrefereARotaPadraoEIgnoraVirtuais(t *testing.T) {
	devs := parseNetDev([]byte(netDev))
	if _, ok := devs["lo"]; ok {
		t.Error("lo deveria ficar de fora")
	}
	if name, _ := pickInterface(devs, defaultRouteInterface([]byte(netRoute))); name != "ens4" {
		t.Errorf("interface = %q, quer ens4 (rota padrão)", name)
	}
	name, c := pickInterface(devs, "")
	want := netCounters{rxBytes: 1000000, rxPackets: 2000, txBytes: 3000000, txPackets: 4000, errors: 4, drops: 6}
	if name != "eth0" || c != want {
		t.Errorf("sem rota padrão = %q %+v, quer eth0 (mais tráfego, sem docker/br/veth) %+v", name, c, want)
	}
	if name, _ := pickInterface(map[string]netCounters{}, ""); name != "" {
		t.Errorf("sem interface = %q", name)
	}
}

func TestParseUDP(t *testing.T) {
	snmp := "Ip: Forwarding DefaultTTL\nIp: 1 64\n" +
		"Udp: InDatagrams NoPorts InErrors OutDatagrams RcvbufErrors SndbufErrors InCsumErrors IgnoredMulti MemErrors\n" +
		"Udp: 1000 5 7 900 3 2 0 0 0\n"
	got, err := parseUDP([]byte(snmp))
	if err != nil || got != (UDP{InErrors: 7, RcvbufErrors: 3, SndbufErrors: 2}) {
		t.Errorf("udp = %+v, %v", got, err)
	}
	if _, err := parseUDP([]byte("Ip: a\nIp: 1\n")); err == nil {
		t.Error("quer erro sem Udp")
	}
}

const mountinfo = `22 1 252:1 / / rw,relatime shared:1 - ext4 /dev/vda1 rw
30 22 0:26 / /opt/concord/data rw - tmpfs tmpfs rw
31 22 0:27 / /opt/concordx rw - tmpfs tmpfs rw
`

func TestMountOfEscolheOPontoMaisLongo(t *testing.T) {
	tests := []struct{ path, dev, source string }{
		{"/opt/concord", "252:1", "/dev/vda1"},
		{"/opt/concord/data/x", "0:26", "tmpfs"},
		{"/opt/concordx", "0:27", "tmpfs"},
	}
	for _, tt := range tests {
		dev, source := mountOf([]byte(mountinfo), tt.path)
		if dev != tt.dev || source != tt.source {
			t.Errorf("%s → %s %s, quer %s %s", tt.path, dev, source, tt.dev, tt.source)
		}
	}
}

const diskstats = ` 252       0 vda 1000 0 80000 500 2000 0 160000 900 0 1500 1400 0 0 0 0
 252       1 vda1 900 0 70000 400 1900 0 150000 800 0 1200 1200 0 0 0 0
`

func TestParseDiskstatsPorDispositivoOuNome(t *testing.T) {
	want := diskCounters{readSectors: 70000, writeSectors: 150000, ioMs: 1200}
	if got, ok := parseDiskstats([]byte(diskstats), "252:1", "/dev/xyz"); !ok || got != want {
		t.Errorf("por major:minor = %+v %v", got, ok)
	}
	if got, ok := parseDiskstats([]byte(diskstats), "0:30", "/dev/vda1"); !ok || got != want {
		t.Errorf("pelo nome do dispositivo = %+v %v", got, ok)
	}
	if _, ok := parseDiskstats([]byte(diskstats), "0:30", "tmpfs"); ok {
		t.Error("tmpfs não tem disco")
	}
}

func TestParseProcessStat(t *testing.T) {
	// O nome entre parênteses pode ter espaço e parêntese.
	stat := "1234 (concord (srv) x) S 1 1234 1234 0 -1 4194560 100 0 0 0 250 50 0 0 20 0 12 0 99 0 0\n"
	got, err := parseProcessTicks([]byte(stat))
	if err != nil || got != 300 {
		t.Errorf("ticks = %d, %v; quer 300", got, err)
	}
	if _, err := parseProcessTicks([]byte("1234 (x\n")); err == nil {
		t.Error("quer erro")
	}
}

func TestParseProcessMemory(t *testing.T) {
	status := "Name:\tpostgres\nVmRSS:\t  20480 kB\nRssAnon:\t   4096 kB\nRssFile:\t1024 kB\nRssShmem:\t  15360 kB\n"
	got := parseProcessMemory([]byte(status))
	if got != (processMemory{rssKB: 20480, anonKB: 4096, shmemKB: 15360}) {
		t.Errorf("memória = %+v", got)
	}
}
