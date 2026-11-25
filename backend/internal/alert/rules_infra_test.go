package alert

import (
	"strings"
	"testing"
	"time"

	"gin-quickstart/backend/internal/serverobs"
)

func i64p(v int64) *int64 { return &v }

func hostAt(now time.Time, ago time.Duration) serverobs.HostMinute {
	return serverobs.HostMinute{Minute: now.Add(-ago)}
}

func TestDiskRules(t *testing.T) {
	now := at(14, 0)
	row := func(ago time.Duration, disk, inodes *float64) []serverobs.HostMinute {
		h := hostAt(now, ago)
		h.DiskUsedPct, h.InodesUsedPct = disk, inodes
		return []serverobs.HostMinute{h}
	}
	tests := []struct {
		name string
		rule func(hostSource) Rule
		rows []serverobs.HostMinute
		want Level
		text string
	}{
		{"disco normal", hostDiskRule, row(time.Minute, num(41), nil), LevelOK, ""},
		{"disco aviso", hostDiskRule, row(time.Minute, num(82), nil), LevelWarning, "disco da pasta de dados em 82% (limite 80%); veja o que cresceu: du -sh /opt/concord/*"},
		{"disco crítico", hostDiskRule, row(time.Minute, num(93), nil), LevelCritical, "disco da pasta de dados em 93% (limite 90%)"},
		{"disco velho", hostDiskRule, row(10*time.Minute, num(99), nil), LevelUnknown, ""},
		{"disco sem número", hostDiskRule, row(time.Minute, nil, nil), LevelUnknown, ""},
		{"sem linhas", hostDiskRule, nil, LevelUnknown, ""},
		{"inodes aviso", hostInodesRule, row(time.Minute, nil, num(85)), LevelWarning, "inodes do disco em 85% (limite 80%)"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := check(t, tt.rule(&fakeSources{host: tt.rows}), now)
			if got.Level != tt.want || !strings.Contains(got.Text, tt.text) {
				t.Errorf("leitura = %+v, quer %d com %q", got, tt.want, tt.text)
			}
		})
	}
}

func TestBackupRule(t *testing.T) {
	now := at(14, 0)
	row := func(backupAgo time.Duration, bytes int64) []serverobs.HostMinute {
		h := hostAt(now, time.Minute)
		at := now.Add(-backupAgo)
		h.BackupAt, h.BackupBytes = &at, &bytes
		return []serverobs.HostMinute{h}
	}
	prev := &Backup{At: now.Add(-36 * time.Hour), Bytes: 300 << 20}
	tests := []struct {
		name string
		src  *fakeSources
		want Level
		text string
	}{
		{"em dia", &fakeSources{host: row(12*time.Hour, 310<<20), prevBackup: prev}, LevelOK, ""},
		{"atrasado", &fakeSources{host: row(27*time.Hour, 310<<20)}, LevelWarning,
			"o backup mais novo do banco é de 24/11 11:00 (há 1 d 3 h, limite 26 h): o concord-backup não rodou"},
		{"encolheu", &fakeSources{host: row(2*time.Hour, 100<<20), prevBackup: prev}, LevelWarning,
			"o backup do banco de 12:00 tem 100 MB, menos da metade do anterior (300 MB)"},
		{"o primeiro", &fakeSources{host: row(2*time.Hour, 100<<20)}, LevelOK, ""},
		{"anterior pequeno demais (dev)", &fakeSources{host: row(2*time.Hour, 1000), prevBackup: &Backup{Bytes: 500 << 10}}, LevelOK, ""},
		{"sem pasta de backup", &fakeSources{host: []serverobs.HostMinute{hostAt(now, time.Minute)}}, LevelUnknown, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := check(t, backupRule(tt.src, tt.src), now)
			if got.Level != tt.want || !strings.Contains(got.Text, tt.text) {
				t.Errorf("leitura = %+v, quer %d com %q", got, tt.want, tt.text)
			}
		})
	}
}

func TestBackupRuleSoConsultaOAnteriorQuandoMuda(t *testing.T) {
	now := at(14, 0)
	h := hostAt(now, time.Minute)
	at, bytes := now.Add(-time.Hour), int64(300<<20)
	h.BackupAt, h.BackupBytes = &at, &bytes
	src := &fakeSources{host: []serverobs.HostMinute{h}}
	rule := backupRule(src, src)
	check(t, rule, now)
	check(t, rule, now.Add(time.Minute))
	if src.backupCalls != 1 {
		t.Fatalf("consultou o anterior %d vezes, quer 1", src.backupCalls)
	}
}

func apiAt(now time.Time, ago time.Duration, requests, errs int) serverobs.APIMinute {
	return serverobs.APIMinute{Minute: now.Add(-ago), Requests: requests, Status5xx: errs}
}

func TestAPIErrorsRule(t *testing.T) {
	now := at(14, 0)
	five := func(requests, errs int) []serverobs.APIMinute {
		var out []serverobs.APIMinute
		for i := 5; i >= 1; i-- {
			out = append(out, apiAt(now, time.Duration(i)*time.Minute, requests, errs))
		}
		return out
	}
	routes := []serverobs.RouteRow{{Route: "GET /api/servers/:id", Requests: 40, Status5xx: 12}}
	tests := []struct {
		name string
		src  *fakeSources
		want Level
		text string
	}{
		{"sem erro", &fakeSources{api: five(100, 0)}, LevelOK, ""},
		{"pouco volume não dispara", &fakeSources{api: five(2, 1)}, LevelOK, ""},
		{"5% vira aviso", &fakeSources{api: five(100, 6), routes: routes}, LevelWarning,
			"30 de 500 pedidos da API com erro 5xx em 5 min (6,0%, limite 5%); a rota que mais errou: GET /api/servers/:id (12); veja o log"},
		{"metade falhando é crítico", &fakeSources{api: five(100, 50)}, LevelCritical, "(50,0%, limite 25%); veja o log"},
		{"coleta velha", &fakeSources{api: []serverobs.APIMinute{apiAt(now, time.Hour, 100, 100)}}, LevelUnknown, ""},
		{"sem linhas", &fakeSources{}, LevelUnknown, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := check(t, apiErrorsRule(tt.src), now)
			if got.Level != tt.want || !strings.Contains(got.Text, tt.text) {
				t.Errorf("leitura = %+v, quer %d com %q", got, tt.want, tt.text)
			}
		})
	}
}

func TestAPIPanicsRule(t *testing.T) {
	now := at(14, 0)
	quiet := apiAt(now, 2*time.Minute, 10, 0)
	loud := apiAt(now, time.Minute, 10, 1)
	loud.Panics = 2
	if got := check(t, apiPanicsRule(&fakeSources{api: []serverobs.APIMinute{quiet}}), now); got.Level != LevelOK {
		t.Errorf("sem panic = %+v", got)
	}
	got := check(t, apiPanicsRule(&fakeSources{api: []serverobs.APIMinute{quiet, loud}}), now)
	if got.Level != LevelWarning || !strings.HasPrefix(got.Text, "2 panic(s) no backend em 15 min") {
		t.Errorf("com panic = %+v", got)
	}
}

func TestAPISlowRule(t *testing.T) {
	now := at(14, 0)
	minute := func(requests int, p95 *float64, waits int) []serverobs.APIMinute {
		m := apiAt(now, time.Minute, requests, 0)
		m.P95Ms, m.DBWaits = p95, waits
		return []serverobs.APIMinute{m}
	}
	routes := []serverobs.RouteRow{
		{Route: "GET /api/a", Requests: 50, P95Ms: num(900)},
		{Route: "GET /api/b", Requests: 8, P95Ms: num(4200)},
		{Route: "GET /api/rara", Requests: 1, P95Ms: num(9000)},
	}
	tests := []struct {
		name string
		src  *fakeSources
		want Level
		text string
	}{
		{"rápida", &fakeSources{api: minute(100, num(120), 0)}, LevelOK, ""},
		{"pouco pedido não conta", &fakeSources{api: minute(3, num(9000), 0)}, LevelOK, ""},
		{"lenta com fila no banco", &fakeSources{api: minute(100, num(2500), 4), routes: routes}, LevelWarning,
			"p95 da API em 2500 ms (limite 2000 ms); a rota mais lenta: GET /api/b (p95 4200 ms); há espera por conexão do banco"},
		{"parada", &fakeSources{api: minute(100, num(6000), 0)}, LevelCritical, "(limite 5000 ms); sem espera no banco"},
		{"sem p95", &fakeSources{api: minute(100, nil, 0)}, LevelOK, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := check(t, apiSlowRule(tt.src), now)
			if got.Level != tt.want || !strings.Contains(got.Text, tt.text) {
				t.Errorf("leitura = %+v, quer %d com %q", got, tt.want, tt.text)
			}
		})
	}
}

func TestDBPoolRule(t *testing.T) {
	now := at(14, 0)
	pool := func(inUse, maxConns, waits int, waitMs float64) *fakeSources {
		m := apiAt(now, time.Minute, 100, 0)
		m.DBInUse, m.DBMax, m.DBWaits, m.DBWaitMs = inUse, maxConns, waits, waitMs
		return &fakeSources{api: []serverobs.APIMinute{m}}
	}
	tests := []struct {
		name string
		src  *fakeSources
		want Level
	}{
		{"folgado", pool(1, 4, 0, 0), LevelOK},
		{"cheio sem fila", pool(4, 4, 0, 0), LevelOK},
		{"cheio com fila", pool(4, 4, 2, 40), LevelWarning},
		{"muita espera", pool(2, 4, 35, 100), LevelWarning},
		{"esperando muito tempo", pool(2, 4, 5, 3500), LevelWarning},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := check(t, dbPoolRule(tt.src), now); got.Level != tt.want {
				t.Errorf("leitura = %+v, quer %d", got, tt.want)
			}
		})
	}
	got := check(t, dbPoolRule(pool(4, 4, 31, 900)), now)
	if !strings.HasPrefix(got.Text, "pool do banco no limite: 4 de 4 conexões em uso, 31 esperas por conexão (900 ms esperando)") {
		t.Errorf("texto = %q", got.Text)
	}
}

func TestSwapRule(t *testing.T) {
	now := at(14, 0)
	rows := func(from, to float64, span time.Duration) []serverobs.HostMinute {
		a, b := hostAt(now, span), hostAt(now, time.Minute)
		a.SwapUsedMB, b.SwapUsedMB = &from, &to
		return []serverobs.HostMinute{a, b}
	}
	tests := []struct {
		name string
		rows []serverobs.HostMinute
		want Level
	}{
		{"parado alto", rows(900, 920, 31*time.Minute), LevelOK},
		{"subindo pouco", rows(100, 300, 31*time.Minute), LevelOK},
		{"subindo muito", rows(400, 800, 31*time.Minute), LevelWarning},
		{"pouca história", rows(0, 900, 10*time.Minute), LevelUnknown},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := check(t, hostSwapRule(&fakeSources{host: tt.rows}), now); got.Level != tt.want {
				t.Errorf("leitura = %+v, quer %d", got, tt.want)
			}
		})
	}
	got := check(t, hostSwapRule(&fakeSources{host: rows(400, 800, 31*time.Minute)}), now)
	if !strings.HasPrefix(got.Text, "swap em 800 MB e subindo (+400 MB em 30 min; limite 512 MB e +256 MB)") {
		t.Errorf("texto = %q", got.Text)
	}
}

func TestStealAndUDPRules(t *testing.T) {
	now := at(14, 0)
	h := hostAt(now, time.Minute)
	h.StealPct = num(14)
	if got := check(t, hostStealRule(&fakeSources{host: []serverobs.HostMinute{h}}), now); got.Level != LevelWarning ||
		!strings.HasPrefix(got.Text, "steal da CPU em 14% (limite 10%)") {
		t.Errorf("steal = %+v", got)
	}
	a, b := hostAt(now, 2*time.Minute), hostAt(now, time.Minute)
	a.UDPRcvbufErrors, b.UDPRcvbufErrors, b.UDPSndbufErrors = i64p(60), i64p(30), i64p(15)
	if got := check(t, udpBufferRule(&fakeSources{host: []serverobs.HostMinute{a, b}}), now); got.Level != LevelWarning ||
		!strings.HasPrefix(got.Text, "105 erros de buffer UDP do kernel em 5 min (limite 100)") {
		t.Errorf("udp = %+v", got)
	}
	b.UDPSndbufErrors = nil
	if got := check(t, udpBufferRule(&fakeSources{host: []serverobs.HostMinute{a, b}}), now); got.Level != LevelOK {
		t.Errorf("udp abaixo = %+v", got)
	}
}

func TestCollectorRule(t *testing.T) {
	now := at(14, 0)
	ago := func(d time.Duration) *time.Time { t := now.Add(-d); return &t }
	host := func(d time.Duration) []serverobs.HostMinute { return []serverobs.HostMinute{hostAt(now, d)} }
	api := func(d time.Duration) []serverobs.APIMinute { return []serverobs.APIMinute{apiAt(now, d, 0, 0)} }
	tests := []struct {
		name string
		src  *fakeSources
		want Level
		text string
	}{
		{"tudo em dia", &fakeSources{host: host(time.Minute), api: api(time.Minute), lastMinute: ago(time.Minute)}, LevelOK, ""},
		{"host parado", &fakeSources{host: host(8 * time.Minute), api: api(time.Minute), lastMinute: ago(time.Minute)}, LevelWarning,
			"a coleta parou com o backend no ar: host_metrics sem linha nova há 8 min (limite 5 min)"},
		{"duas paradas", &fakeSources{host: host(7 * time.Minute), api: api(9 * time.Minute), lastMinute: ago(time.Minute)}, LevelWarning,
			"host_metrics, api_metrics sem linha nova há 9 min"},
		{"livekit desligado há dias não conta", &fakeSources{host: host(time.Minute), api: api(time.Minute), lastMinute: ago(48 * time.Hour)}, LevelOK, ""},
		{"nada coletado", &fakeSources{}, LevelUnknown, ""},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := check(t, collectorRule(tt.src), now)
			if got.Level != tt.want || !strings.Contains(got.Text, tt.text) {
				t.Errorf("leitura = %+v, quer %d com %q", got, tt.want, tt.text)
			}
		})
	}
}

func TestCapacityRule(t *testing.T) {
	now := at(14, 0)
	src := &fakeSources{peak: &Peak{Minute: at(21, 0).Add(-48 * time.Hour), Mbps: 47.6}}
	rule := capacityRule(src)
	got := check(t, rule, now)
	if got.Level != LevelWarning || got.Text != "o pico de saída das lives nos últimos 7 dias foi 48 Mbps (23/11 21:00; limite 45): o teto de CPU da VPS fica perto de 60 Mbps, uns 13 espectadores de live ao mesmo tempo; hora de planejar mais vCPU" {
		t.Errorf("acima = %+v", got)
	}
	if rule.Remind != 7*24*time.Hour {
		t.Errorf("lembrete = %v", rule.Remind)
	}
	check(t, rule, now.Add(30*time.Minute))
	if src.peakCalls != 1 {
		t.Errorf("consultou %d vezes em meia hora, quer 1", src.peakCalls)
	}
	src.peak = &Peak{Mbps: 30}
	if got := check(t, rule, now.Add(61*time.Minute)); got.Level != LevelOK || src.peakCalls != 2 {
		t.Errorf("abaixo depois de 1 h = %+v (%d consultas)", got, src.peakCalls)
	}
	if got := check(t, capacityRule(&fakeSources{}), now); got.Level != LevelUnknown {
		t.Errorf("sem linhas = %+v", got)
	}
}
