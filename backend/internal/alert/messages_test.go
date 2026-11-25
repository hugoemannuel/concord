package alert

import (
	"testing"
	"time"
)

var brt = time.FixedZone("BRT", -3*3600)

func at(h, m int) time.Time { return time.Date(2026, 11, 25, h, m, 0, 0, brt) }

func TestDuration(t *testing.T) {
	tests := []struct {
		d    time.Duration
		want string
	}{
		{4 * time.Second, "4 s"},
		{90 * time.Second, "1 min"},
		{16 * time.Minute, "16 min"},
		{2 * time.Hour, "2 h"},
		{80 * time.Minute, "1 h 20 min"},
		{27 * time.Hour, "1 d 3 h"},
	}
	for _, tt := range tests {
		if got := duration(tt.d); got != tt.want {
			t.Errorf("duration(%v) = %q, quer %q", tt.d, got, tt.want)
		}
	}
}

func TestClock(t *testing.T) {
	now := at(14, 18)
	if got := clock(at(14, 2).UTC(), now); got != "14:02" {
		t.Errorf("mesmo dia = %q", got)
	}
	if got := clock(at(14, 2).Add(-24*time.Hour), now); got != "24/11 14:02" {
		t.Errorf("outro dia = %q", got)
	}
}

func TestRuleMessages(t *testing.T) {
	rule := Rule{ID: "host_cpu", Title: "CPU da máquina", Tab: "servidor"}
	w := texts{appURL: "https://app.example"}
	since, now := at(14, 2), at(14, 18)
	warn := Reading{Level: LevelWarning, Text: "CPU da máquina em 88% (limite 85%)"}
	crit := Reading{Level: LevelCritical, Text: "CPU da máquina em 97% (limite 95%)"}
	tests := []struct{ name, got, want string }{
		{"aviso", w.fire(rule, warn, since, now),
			"Aviso: CPU da máquina em 88% (limite 85%), desde 14:02. https://app.example/observabilidade/servidor"},
		{"crítico", w.fire(rule, crit, since, now),
			"@all Crítico: CPU da máquina em 97% (limite 95%), desde 14:02. https://app.example/observabilidade/servidor"},
		{"piorou", w.escalate(rule, crit, since, now),
			"@all Crítico (piorou): CPU da máquina em 97% (limite 95%), desde 14:02. https://app.example/observabilidade/servidor"},
		{"lembrete", w.remind(rule, warn, since, now),
			"Continua: CPU da máquina em 88% (limite 85%), há 16 min. https://app.example/observabilidade/servidor"},
		{"normalizou", w.resolve(rule, since, now), "Normalizou: CPU da máquina. Durou 16 min (de 14:02 a 14:18)."},
		{"sem aba, sem link", w.fire(Rule{Title: "X"}, warn, since, now),
			"Aviso: CPU da máquina em 88% (limite 85%), desde 14:02."},
	}
	for _, tt := range tests {
		if tt.got != tt.want {
			t.Errorf("%s:\n got %q\nquer %q", tt.name, tt.got, tt.want)
		}
	}
}

func TestEventMessages(t *testing.T) {
	now := at(14, 18)
	tests := []struct{ name, got, want string }{
		{"primeiro boot", bootFirstText("a1b2c3d"), "Backend no ar, versão a1b2c3d. Alertas ligados a partir de agora."},
		{"reinício limpo", bootCleanText("a1b2c3d", 4*time.Second), "Backend no ar, versão a1b2c3d. Reinício limpo, ficou fora 4 s."},
		{"caiu e voltou logo", bootCrashText("a1b2c3d", 5*time.Second),
			"Aviso: o backend caiu e voltou sozinho em 5 s, sem desligamento limpo. Versão a1b2c3d."},
		{"ficou fora", bootDownText("a1b2c3d", at(14, 2), now),
			"Aviso: o backend ficou fora de 14:02 a 14:18 (16 min), sem desligamento limpo: queda do processo ou da VPS. Voltou na versão a1b2c3d."},
		{"banco", databaseDownText(at(14, 2), at(14, 5), now), "Aviso: o backend ficou sem banco de 14:02 a 14:05 (3 min)."},
		{"unidade", unitFailedText("concord-backup.service"),
			"Aviso: o serviço concord-backup.service falhou. Veja no servidor: journalctl -u concord-backup.service -n 50"},
	}
	for _, tt := range tests {
		if tt.got != tt.want {
			t.Errorf("%s:\n got %q\nquer %q", tt.name, tt.got, tt.want)
		}
	}
}
