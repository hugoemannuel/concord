package event

import (
	"fmt"
	"time"
)

const (
	// maxEarlyLate: aviso de antecedência atrasado mais que isso é descartado.
	maxEarlyLate = 10 * time.Minute
	// maxStartLate: o "começou" ainda vale até 1 h depois do início.
	maxStartLate = time.Hour
)

// reminderText é a DM do Salinha Bot. Antes de começar a sala ainda não existe;
// na hora, o aviso diz onde entrar (textos aguardando aprovação).
func reminderText(d DueReminder) string {
	if d.OffsetMinutes > 0 {
		return fmt.Sprintf(`🔔 O evento "%s" começa em %s, no servidor %s.%s A sala abre na hora de começar.`, d.Title, spanText(d.OffsetMinutes), d.ServerName, gameSentence(d))
	}
	if d.ChannelName == "" {
		return fmt.Sprintf(`📅 O evento "%s" está começando agora, no servidor %s.%s`, d.Title, d.ServerName, gameSentence(d))
	}
	return fmt.Sprintf(`📅 O evento "%s" está começando agora.%s Entre na sala #%s, no servidor %s.`, d.Title, gameSentence(d), d.ChannelName, d.ServerName)
}

// gameSentence: " Jogo: X." quando o evento tem jogo, senão nada (os textos sem jogo não mudam).
func gameSentence(d DueReminder) string {
	if d.Game == "" {
		return ""
	}
	return " Jogo: " + d.Game + "."
}

// spanText: "10 minutos", "1 hora", "1 dia".
func spanText(minutes int) string {
	switch minutes {
	case 1440:
		return "1 dia"
	case 60:
		return "1 hora"
	}
	return fmt.Sprintf("%d minutos", minutes)
}

// stale: o aviso venceu faz tempo (o servidor ficou fora do ar) e não faz mais sentido.
func stale(d DueReminder, now time.Time) bool {
	if d.OffsetMinutes == 0 {
		return now.After(d.Occurrence.Add(maxStartLate))
	}
	return now.After(d.DueAt.Add(maxEarlyLate))
}
