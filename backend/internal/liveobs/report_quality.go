package liveobs

// Motivos e pontuação dos sinais da ADR 0032: em que ponto do caminho
// (captura → codificador → rede → decodificador) os quadros da live se
// perdem, e o que aconteceu com a voz (áudio sintetizado, perda, quedas).
// Os textos aparecem no painel dos devs. Puro.

const (
	// Captura ou fps abaixo disso do alvo conta como "abaixo".
	belowTarget = 0.8
	// Áudio sintetizado (%) a partir do qual a voz soa robotizada/cortada.
	robotPct = 3.0
	// Perda (%) no áudio recebido que já explica a síntese.
	audioLossPct = 2.0
	// Minuto ruim da voz (report_repository.go): áudio sintetizado ≥ robotPct
	// ou perda recebida ≥ badLossPct.
	badLossPct = 5.0
	// Abaixo disso de perda, a síntese não veio da rede.
	noLossPct = 0.5
)

func below(v, target *float64) bool {
	return v != nil && target != nil && *target > 0 && *v < belowTarget**target
}

// slowEncoder: o codificador entrega bem menos quadros do que a captura
// manda. O codec_ms alto na placa sozinho não diz isso: é latência de fila
// (AMD entregando 49–55 fps com 15 ms/quadro, an-transmite P4).
func slowEncoder(s SessionStats) bool { return below(s.FPS, s.CaptureFPS) }

// notDecoded: chegam bem mais quadros do que saem do decodificador.
func notDecoded(s SessionStats) bool {
	if s.RecvFPS == nil || s.FPS == nil {
		return false
	}
	return *s.RecvFPS-*s.FPS >= max(5, 0.2**s.RecvFPS)
}

// robotic: a média da sessão ou ao menos um minuto medido robotizado.
func robotic(s SessionStats) bool {
	return ratioAtLeast(s.ConcealedPct, robotPct) || s.RoboticMinutes > 0
}

// lossy: perda recebida alta na média ou ao menos um minuto com perda ≥ 5%.
func lossy(s SessionStats) bool {
	return ratioAtLeast(s.RecvLossPct, audioLossPct) || s.LossMinutes > 0
}

func kindIs(kind string, hit func(SessionStats) bool) func(SessionStats) bool {
	return func(s SessionStats) bool { return s.Kind == kind && hit(s) }
}

var qualityRules = []reasonRule{
	{"Captura abaixo do alvo (não é o codificador)", kindIs(KindShare, func(s SessionStats) bool { return below(s.CaptureFPS, s.TargetFPS) })},
	{"Codificador não dá conta (codifica menos quadros que a captura)", kindIs(KindShare, slowEncoder)},
	{"Quadros chegam e não decodificam", kindIs(KindWatch, notDecoded)},
	{"Voz robotizada (áudio sintetizado)", kindIs(KindCall, robotic)},
	{"Perda no áudio recebido", kindIs(KindCall, lossy)},
	{"Áudio sintetizado sem perda (PC de quem ouve)", kindIs(KindCall, func(s SessionStats) bool {
		return robotic(s) && s.RecvLossPct != nil && *s.RecvLossPct < noLossPct && s.LossMinutes == 0
	})},
	{"Voz reconectou", func(s SessionStats) bool { return s.Reconnects > 0 }},
	{"Voz não conectou", func(s SessionStats) bool { return s.Failures > 0 }},
	{"Sem acesso à chamada (não é queda)", func(s SessionStats) bool { return s.AccessFailures > 0 }},
}

// callScore: quanto pior a voz, maior. Conta os minutos ruins (não a média da
// sessão, que dilui um episódio longo), as quedas e as falhas de rede; a falha
// de acesso (chamada encerrada, sem permissão) não pesa.
func callScore(s SessionStats) float64 {
	return s.BadMinutes*10 + float64(s.Reconnects)*20 + float64(s.Failures)*100
}
