package alert

import "time"

// Decodificador falhando em massa (#qualidade): o app manda decoder_software
// quando quem assiste passa a decodificar a live no processador (ADR 0032).
// É raro (a análise de 11 a 25/11/2026 achou o gargalo do decodificador em
// poucas pessoas, quase sempre a mesma placa ou o Brave); 4 pessoas
// diferentes em 10 min aponta para algo comum a todas: um codec novo na
// ordem, uma versão do app ou um driver. Aviso: a live segue, pior.
//
// "Lives abaixo do alvo" não tem evento (é a média das amostras): fica no
// resumo diário.
const (
	decoderWindow = 10 * time.Minute
	decoderPeople = 4
)

func decoderFailingRule(src eventSource) Rule {
	return Rule{
		ID: "decoder_failing", Title: "Decodificador falhando em massa", Channel: ChannelQuality, Tab: "lives",
		Hold: Hold{Clear: 15 * time.Minute},
		Check: peopleCheck(src, "decoder_software", "", decoderWindow, decoderPeople, LevelWarning,
			"%d pessoas assistindo live com o vídeo caindo para o processador em 10 min (limite %d): costuma ser um codec novo na ordem, uma versão do app ou um driver; veja a aba Lives"),
	}
}
