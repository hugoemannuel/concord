package liveobs

// Motivos só do app Android (ADR 0070): a queda veio junto de sair do app ou
// de trocar de rede. Sem queda, sair do app e trocar de rede não são motivo.
// Os textos aparecem no painel dos devs. Puro.

func dropped(s SessionStats) bool { return s.Reconnects > 0 || s.Failures > 0 }

var mobileRules = []reasonRule{
	{"Caiu com o app em segundo plano", func(s SessionStats) bool { return s.Backgrounds > 0 && dropped(s) }},
	{"Caiu ao trocar de rede", func(s SessionStats) bool { return s.NetworkChanges > 0 && dropped(s) }},
}
