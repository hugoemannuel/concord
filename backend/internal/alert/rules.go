package alert

// Sources: de onde as regras leem (o Repository implementa tudo).
type Sources interface {
	minuteSource
	crashSource
	eventSource
}

// Rules: as regras avaliadas a cada minuto. Regra nova = um rule_<nome>.go
// com o construtor e uma linha aqui (docs/OBSERVABILIDADE.md § Alertas).
func Rules(src Sources) []Rule {
	return []Rule{
		restartLoopRule(src),
		hostCPURule(src),
		hostMemRule(src),
		liveKitDownRule(src),
		liveKitCPURule(src),
		callFailuresRule(src),
		callReconnectsRule(src),
	}
}

// Títulos dos eventos (os que não são regras avaliadas), para o painel.
const (
	backendDownRuleID  = "backend_down"
	databaseDownRuleID = "database_down"
	unitFailedRuleID   = "unit_failed"
)

// Titles: o nome de cada regra e evento, para o painel.
func Titles(rules []Rule) map[string]string {
	out := map[string]string{
		backendDownRuleID:  "Backend fora do ar",
		databaseDownRuleID: "Banco fora do ar",
		unitFailedRuleID:   "Serviço do systemd falhou",
	}
	for _, r := range rules {
		out[r.ID] = r.Title
	}
	return out
}
