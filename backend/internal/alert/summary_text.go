package alert

import (
	"fmt"
	"strings"
	"time"

	"gin-quickstart/backend/internal/apperrors"
)

// O texto do resumo diário: uma linha por assunto, só os números que mudam
// uma decisão, sem nome de pessoa. Mudou um texto aqui? Precisa de aprovação.

func summaryText(day time.Time, s DayStats, top []apperrors.GroupImpact, titles map[string]string, link string) string {
	lines := []string{
		"Resumo de " + day.In(zone).Format("02/01") + " (horário de Brasília)",
		voiceLine(s),
		livesLine(s),
		errorsLine(top),
		apiLine(s),
		machineLine(s, day),
		alertsLine(s, titles),
	}
	if link != "" {
		lines = append(lines, "Painel:"+link)
	}
	return strings.Join(lines, "\n")
}

func voiceLine(s DayStats) string {
	return fmt.Sprintf("Voz: %d pessoas, %s h em call; %d falhas de conexão (%d pessoas), %d reconexões (%d pessoas)",
		s.CallPeople, decimal(s.CallHours, 1), s.ConnectFailed, s.FailedPeople, s.Reconnects, s.ReconnectPeople)
}

func livesLine(s DayStats) string {
	return fmt.Sprintf("Lives: %d, %d abaixo do alvo; pico de saída %s (teto perto de %d Mbps)",
		s.Lives, s.LivesBelow, orNoData(s.PeakMbps, "%.0f Mbps"), capacityCeilMbps)
}

func errorsLine(top []apperrors.GroupImpact) string {
	if len(top) == 0 {
		return "Erros: nenhum com pessoas afetadas"
	}
	parts := make([]string, len(top))
	for i, g := range top {
		parts[i] = fmt.Sprintf("%q (%s) %d pessoas", shortN(errorLine(g.Kind, g.Message), 60), sourceLabel(g.Source), g.Users)
	}
	return "Erros com mais gente: " + strings.Join(parts, " · ")
}

func apiLine(s DayStats) string {
	pct := "0"
	if s.Requests > 0 {
		pct = decimal(100*float64(s.Errors5xx)/float64(s.Requests), 1)
	}
	line := fmt.Sprintf("API: %d pedidos, %d com 5xx (%s%%); p95 típico %s, pior minuto %s",
		s.Requests, s.Errors5xx, pct, orNoData(s.P95Typical, "%.0f ms"), orNoData(s.P95Worst, "%.0f ms"))
	if s.Panics > 0 {
		line += fmt.Sprintf("; %d panics", s.Panics)
	}
	return line
}

func machineLine(s DayStats, day time.Time) string {
	return fmt.Sprintf("Máquina: CPU no pico %s (p95 %s), memória no pico %s, disco %s; %s",
		orNoData(s.CPUMax, "%.0f%%"), orNoData(s.CPUP95, "%.0f%%"), orNoData(s.MemMax, "%.0f%%"), orNoData(s.DiskPct, "%.0f%%"),
		backupLine(s, day))
}

// backupLine: "backup de 21:13, 120 MB" se rodou no dia; senão, de quando é o mais novo.
func backupLine(s DayStats, day time.Time) string {
	if s.BackupAt == nil {
		return "backup: sem dado"
	}
	end := day.Add(summaryDayHours)
	if s.BackupAt.Before(day) {
		return "backup NÃO rodou (o mais novo é de " + clock(*s.BackupAt, end) + ")"
	}
	size := ""
	if s.BackupBytes != nil {
		size = ", " + megabytes(*s.BackupBytes)
	}
	return "backup de " + s.BackupAt.In(zone).Format("15:04") + size
}

func alertsLine(s DayStats, titles map[string]string) string {
	total := 0
	parts := make([]string, 0, len(s.Alerts))
	for _, c := range s.Alerts {
		total += c.Count
		title := titles[c.RuleID]
		if title == "" {
			title = c.RuleID
		}
		parts = append(parts, fmt.Sprintf("%s %d", title, c.Count))
	}
	line := "Alertas: nenhum"
	if total > 0 {
		line = fmt.Sprintf("Alertas: %d (%s)", total, strings.Join(parts, ", "))
	}
	return line + fmt.Sprintf("; abertos agora: %d", s.OpenAlerts)
}

func orNoData(v *float64, format string) string {
	if v == nil {
		return "sem dado"
	}
	return fmt.Sprintf(format, *v)
}

// shortN: no máximo n letras, com "…".
func shortN(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n-1]) + "…"
}
