package liveobs

// Sinais novos de mídia (ADR 0074; migration 000221): por que a captura cai,
// quanto a live demora para entrar no ar, a qualidade da imagem, o
// processamento do microfone, a saída de áudio e a câmera. Achatados na
// amostra (o JSON é o mesmo objeto). Versões antigas do app não mandam: nulos.

// Eventos da ADR 0074.
const (
	// A live não começou: a etapa (seletor, codec, publicação) e o nome do erro.
	EventLiveFailed = "live_falhou"
	// O PC dormiu com a call aberta (quanto tempo); na hora em que dormiu.
	EventSlept = "pc_dormiu"
)

const (
	// maxQP: o maior QP dos codecs (AV1 vai até 255).
	maxQP = 255.0
	// maxDSP: o que estava ligado no microfone ("rnnoise · voz:robo · portão").
	maxDSP = 48
)

var surfaces = map[string]bool{"monitor": true, "window": true, "browser": true}

type MediaSignals struct {
	// QP: transmite, QP médio do intervalo (escala do codec).
	QP *float64 `json:"qp"`
	// StartMs: 1ª amostra; transmite = até a live publicada, assiste = até o 1º quadro.
	StartMs *int `json:"start_ms"`
	// SourceWidth/Height e Surface: a fonte da live (monitor, window, browser).
	SourceWidth  *int   `json:"source_width"`
	SourceHeight *int   `json:"source_height"`
	Surface      string `json:"surface"`
	// DSPUnderrunPct e DSP: call, % do tempo com o microfone atrasado e o que estava ligado.
	DSPUnderrunPct *float64 `json:"dsp_underrun_pct"`
	DSP            string   `json:"dsp"`
	// PlayoutSynthPct: call, % do áudio tocado sintetizado pela saída do PC.
	PlayoutSynthPct *float64 `json:"playout_synth_pct"`
	// Cam*: call, a minha câmera enviada e os congelamentos das câmeras recebidas.
	CamFPS        *float64 `json:"cam_fps"`
	CamHeight     *int     `json:"cam_height"`
	CamLimitation string   `json:"cam_limitation"`
	CamFreezes    *int     `json:"cam_freezes"`
}

// clean: números com teto (negativo vira vazio) e textos de listas fixas.
func (m *MediaSignals) clean() {
	m.QP = floatIn(m.QP, maxQP)
	m.StartMs = intIn(m.StartMs, int(maxMs))
	m.SourceWidth = intIn(m.SourceWidth, maxPixels)
	m.SourceHeight = intIn(m.SourceHeight, maxPixels)
	m.Surface = oneOf(m.Surface, surfaces)
	m.DSPUnderrunPct = floatIn(m.DSPUnderrunPct, 100)
	m.DSP = cut(m.DSP, maxDSP)
	m.PlayoutSynthPct = floatIn(m.PlayoutSynthPct, 100)
	m.CamFPS = floatIn(m.CamFPS, maxFPS)
	m.CamHeight = intIn(m.CamHeight, maxPixels)
	m.CamLimitation = oneOf(m.CamLimitation, limitations)
	m.CamFreezes = intIn(m.CamFreezes, maxCount)
}

// values: as colunas da migration 000221, na ordem do INSERT (texto vazio = nulo).
func (m *MediaSignals) values() []any {
	return []any{m.QP, m.StartMs, m.SourceWidth, m.SourceHeight, nullable(m.Surface),
		m.DSPUnderrunPct, nullable(m.DSP), m.PlayoutSynthPct,
		m.CamFPS, m.CamHeight, nullable(m.CamLimitation), m.CamFreezes}
}
