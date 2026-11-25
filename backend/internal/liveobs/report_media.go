package liveobs

// Os sinais da ADR 0074 no painel: tela parada descontada dos congelamentos,
// tempo até a live no ar e até o primeiro quadro, a fonte e o motor da live,
// o microfone, a saída de áudio e a câmera de quem está na call. Puro, menos
// o pedaço de SQL que o sessionStatsSQL junta.

// staticFrameSQL: abaixo desses bytes por quadro recebido, a amostra de quem
// assiste é tela parada (só quadros de repetição); o congelamento dela ninguém
// vê. Regra a calibrar com a consulta do OBSERVABILIDADE.md.
const staticFrameSQL = "1000"

// Limites dos motivos novos.
const (
	slowLiveStartMs   = 5000.0
	slowFirstFrameMs  = 3000.0
	dspUnderrunPct    = 1.0
	playoutSynthPct   = 1.0
	minCameraFPS      = 15.0
	cameraFreezesMin  = 1.0
	dspScorePerPct    = 10.0
	camScorePerFreeze = 5.0
)

// MediaStats: os sinais da ADR 0074 de uma sessão (médias das amostras; nil = sem dado).
type MediaStats struct {
	// StaticFreezes: congelamentos das amostras de tela parada (já dentro de Freezes).
	StaticFreezes int64    `json:"static_freezes"`
	QP            *float64 `json:"qp"`
	StartMs       *float64 `json:"start_ms"`
	// SourceHeight: a maior altura da fonte; Surface: a superfície mais vista.
	SourceHeight *float64 `json:"source_height"`
	Surface      string   `json:"surface"`
	// Engine: nativo ou chromium, pelo codec_escolhido ("" = sem o evento).
	Engine          string   `json:"engine"`
	DSPUnderrunPct  *float64 `json:"dsp_underrun_pct"`
	DSP             string   `json:"dsp"`
	PlayoutSynthPct *float64 `json:"playout_synth_pct"`
	CamFPS          *float64 `json:"cam_fps"`
	// CamFreezes e CamSeconds: congelamentos das câmeras recebidas e o tempo medido delas.
	CamFreezes int64   `json:"cam_freezes"`
	CamSeconds float64 `json:"cam_seconds"`
}

// mediaStatsSQL: as colunas de MediaStats no SELECT do sessionStatsSQL (mesma ordem de fields).
const mediaStatsSQL = `,
	COALESCE(SUM(x.freezes) FILTER (WHERE x.recv_fps > 0
		AND x.bitrate_kbps * 125.0 / x.recv_fps < ` + staticFrameSQL + `), 0),
	AVG(x.qp), AVG(x.start_ms), MAX(x.source_height),
	COALESCE(mode() WITHIN GROUP (ORDER BY x.surface) FILTER (WHERE x.surface IS NOT NULL), ''),
	(SELECT CASE WHEN count(*) = 0 THEN '' WHEN bool_or(e.detail LIKE 'nativo%') THEN 'nativo' ELSE 'chromium' END
		FROM live_events e WHERE e.session_id = s.id AND e.type = 'codec_escolhido'),
	AVG(x.dsp_underrun_pct),
	COALESCE(mode() WITHIN GROUP (ORDER BY x.dsp) FILTER (WHERE x.dsp IS NOT NULL), ''),
	AVG(x.playout_synth_pct), AVG(x.cam_fps),
	COALESCE(SUM(x.cam_freezes), 0), COALESCE(SUM(x.seconds) FILTER (WHERE x.cam_freezes IS NOT NULL), 0)`

func (m *MediaStats) fields() []any {
	return []any{&m.StaticFreezes, &m.QP, &m.StartMs, &m.SourceHeight, &m.Surface, &m.Engine,
		&m.DSPUnderrunPct, &m.DSP, &m.PlayoutSynthPct, &m.CamFPS, &m.CamFreezes, &m.CamSeconds}
}

// seenFreezes: os congelamentos que alguém viu (sem os de tela parada).
func seenFreezes(s SessionStats) int64 { return max(0, s.Freezes-s.StaticFreezes) }

func camFreezesPerMin(s SessionStats) float64 {
	return orZero(ratePerMinute(s.CamFreezes, s.CamSeconds))
}

// slowCamera: a minha câmera saindo devagar ou as que recebo congelando.
func slowCamera(s SessionStats) bool {
	return (s.CamFPS != nil && *s.CamFPS < minCameraFPS) || camFreezesPerMin(s) >= cameraFreezesMin
}

var mediaRules = []reasonRule{
	{"Demorou para entrar no ar", kindIs(KindShare, func(s SessionStats) bool { return ratioAtLeast(s.StartMs, slowLiveStartMs) })},
	{"Primeiro quadro demorou", kindIs(KindWatch, func(s SessionStats) bool { return ratioAtLeast(s.StartMs, slowFirstFrameMs) })},
	{"Processamento do microfone engasga (PC de quem fala)", kindIs(KindCall, func(s SessionStats) bool {
		return ratioAtLeast(s.DSPUnderrunPct, dspUnderrunPct)
	})},
	{"Saída de áudio do PC falha (não é a rede)", kindIs(KindCall, func(s SessionStats) bool {
		return ratioAtLeast(s.PlayoutSynthPct, playoutSynthPct)
	})},
	{"Câmera travando ou lenta", kindIs(KindCall, slowCamera)},
}

// mediaCallScore: o microfone e a saída de áudio (1% ≈ um minuto de voz ruim) e a câmera.
func mediaCallScore(s SessionStats) float64 {
	return (orZero(s.DSPUnderrunPct)+orZero(s.PlayoutSynthPct))*dspScorePerPct +
		camFreezesPerMin(s)*camScorePerFreeze
}
