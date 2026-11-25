package alert

import (
	"fmt"
	"strings"
	"time"

	"gin-quickstart/backend/internal/apperrors"
)

// Todos os textos que os alertas postam. Português simples, uma ou duas
// linhas, com o número, o limite e desde quando. Mudou um texto aqui? Ele
// precisa de aprovação (texto que o usuário lê).

// zone: horário de Brasília (sem horário de verão desde 2019).
var zone = time.FixedZone("BRT", -3*3600)

// texts monta as mensagens das regras; appURL é a base do link do painel.
type texts struct {
	appURL string
}

func (w texts) link(rule Rule) string {
	if rule.Tab == "" || w.appURL == "" {
		return ""
	}
	return " " + strings.TrimRight(w.appURL, "/") + "/observabilidade/" + rule.Tab
}

func severityPrefix(level Level) string {
	if level == LevelCritical {
		return "@all Crítico"
	}
	return "Aviso"
}

func (w texts) fire(rule Rule, r Reading, since, now time.Time) string {
	return fmt.Sprintf("%s: %s, desde %s.%s", severityPrefix(r.Level), r.Text, clock(since, now), w.link(rule))
}

func (w texts) escalate(rule Rule, r Reading, since, now time.Time) string {
	return fmt.Sprintf("%s (piorou): %s, desde %s.%s", severityPrefix(r.Level), r.Text, clock(since, now), w.link(rule))
}

// remind: sem @all, para o lembrete não virar push de novo.
func (w texts) remind(rule Rule, r Reading, since, now time.Time) string {
	return fmt.Sprintf("Continua: %s, há %s.%s", r.Text, duration(now.Sub(since)), w.link(rule))
}

func (w texts) resolve(rule Rule, since, now time.Time) string {
	return fmt.Sprintf("Normalizou: %s. Durou %s (de %s a %s).", rule.Title, duration(now.Sub(since)), clock(since, now), clock(now, now))
}

func bootFirstText(version string) string {
	return fmt.Sprintf("Backend no ar, versão %s. Alertas ligados a partir de agora.", version)
}

func bootCleanText(version string, down time.Duration) string {
	return fmt.Sprintf("Backend no ar, versão %s. Reinício limpo, ficou fora %s.", version, duration(down))
}

func bootCrashText(version string, down time.Duration) string {
	return fmt.Sprintf("Aviso: o backend caiu e voltou sozinho em %s, sem desligamento limpo. Versão %s.", duration(down), version)
}

func bootDownText(version string, from, now time.Time) string {
	return fmt.Sprintf("Aviso: o backend ficou fora de %s a %s (%s), sem desligamento limpo: queda do processo ou da VPS. Voltou na versão %s.",
		clock(from, now), clock(now, now), duration(now.Sub(from)), version)
}

func databaseDownText(from, to, now time.Time) string {
	return fmt.Sprintf("Aviso: o backend ficou sem banco de %s a %s (%s).", clock(from, now), clock(to, now), duration(to.Sub(from)))
}

func unitFailedText(unit string) string {
	return fmt.Sprintf("Aviso: o serviço %s falhou. Veja no servidor: journalctl -u %s -n 50", unit, unit)
}

// clock: "14:02" no mesmo dia de now (horário de Brasília), "24/11 14:02" em outro.
func clock(t, now time.Time) string {
	t, now = t.In(zone), now.In(zone)
	if t.YearDay() == now.YearDay() && t.Year() == now.Year() {
		return t.Format("15:04")
	}
	return t.Format("02/01 15:04")
}

// duration: "4 s", "16 min", "1 h 20 min", "1 d 3 h".
func duration(d time.Duration) string {
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%d s", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%d min", int(d.Minutes()))
	case d < 24*time.Hour:
		return withRest(int(d.Hours()), "h", int(d.Minutes())%60, "min")
	}
	return withRest(int(d.Hours())/24, "d", int(d.Hours())%24, "h")
}

func withRest(big int, bigUnit string, rest int, restUnit string) string {
	if rest == 0 {
		return fmt.Sprintf("%d %s", big, bigUnit)
	}
	return fmt.Sprintf("%d %s %d %s", big, bigUnit, rest, restUnit)
}

// frozenText: a máquina voltou de um congelamento e o relógio ainda está atrasado.
func frozenText(from, to time.Time) string {
	d := duration(to.Sub(from))
	return fmt.Sprintf("%s: a máquina ficou congelada por %s (de %s a %s, estimado) e voltou sem reiniciar: pausa do provedor. "+
		"O relógio do sistema está %s atrasado e as mensagens saem com a hora errada até sincronizar (systemctl restart systemd-timesyncd força). Veja o painel do provedor.",
		severityPrefix(LevelCritical), d, clock(from, to), clock(to, to), d)
}

// frozenJumpText: o relógio saltou para a frente (o NTP corrigiu um congelamento
// que o relógio de hardware não viu, ou a máquina foi suspensa).
func frozenJumpText(from, to time.Time) string {
	return fmt.Sprintf("%s: o relógio do sistema saltou %s para a frente: a máquina ficou parada (congelada pelo provedor ou suspensa) de %s a %s, estimado, e voltou sem reiniciar. Veja o painel do provedor.",
		severityPrefix(LevelCritical), duration(to.Sub(from)), clock(from, to), clock(to, to))
}

// newErrorText: um grupo de erro visto pela primeira vez; link = " <url>" ou "".
func newErrorText(g apperrors.GroupHead, link string) string {
	return fmt.Sprintf("Erro novo no %s%s: %s. Aba Erros:%s", sourceLabel(g.Source), versionSuffix(g.FirstVersion), short(errorLine(g.Kind, g.Message)), orNone(link))
}

// manyErrorsText: os erros novos que passaram do teto da hora.
func manyErrorsText(n int, source, version, link string) string {
	return fmt.Sprintf("Mais %d erros novos (teto de %d avisos por hora), a maioria no %s%s. Aba Erros:%s",
		n, errorNewPerHour, sourceLabel(source), versionSuffix(version), orNone(link))
}

func versionSuffix(version string) string {
	if version == "" {
		return ""
	}
	return ", versão " + version
}

// orNone: o link, ou " /observabilidade/erros" sem APP_URL.
func orNone(link string) string {
	if link == "" {
		return " /observabilidade/erros"
	}
	return link
}
