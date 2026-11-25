package liveobs

// Telemetria das lives e calls: o que o app manda (POST /api/obs/telemetry).
// Só números e nomes técnicos (ver docs/adr/0029-observabilidade-das-lives.md).

// Tipos de sessão.
const (
	KindShare = "transmite"
	KindWatch = "assiste"
	KindCall  = "call"
)

// Eventos que o app manda (os de início e fim são do servidor).
const (
	EventStart         = "inicio"
	EventEnd           = "fim"
	EventStepDown      = "degrau_caiu"
	EventStepUp        = "degrau_subiu"
	EventBackupOn      = "reserva_ligada"
	EventEncoderSW     = "encoder_software"
	EventDecoderSW     = "decoder_software"
	EventLongFreeze    = "congelamento_longo"
	EventServerPaused  = "pausada_pelo_servidor"
	EventCodecSwitched = "codec_trocou"
	// Por que a live saiu nesse codec (preferência, o que a placa codifica,
	// codecs marcados como "caiu no processador").
	EventCodecChosen = "codec_escolhido"
	// A voz não conectou ou caiu sem volta (etapa e motivo).
	EventConnectFailed = "conexao_falhou"
	// A voz caiu e voltou sozinha (quanto tempo ficou fora).
	EventReconnected = "reconectou"
	// Só do app Android (ADR 0070): saiu do app e voltou (quanto tempo fora),
	// trocou de rede no meio da call e por onde sai o áudio.
	EventBackground     = "segundo_plano"
	EventForeground     = "primeiro_plano"
	EventNetworkChanged = "rede_trocou"
	EventAudioRoute     = "rota_do_audio"
	// O H.265 de uma live chegou e não decodificou (ADR 0073): o app desktop
	// deixa de anunciá-lo para receber na próxima abertura (no navegador, só o evento).
	EventDecoderFailed = "decoder_falhou"
)

// Batch: um pedido do app, com todas as sessões ativas dele.
type Batch struct {
	Reports []Report `json:"reports"`
}

// Report: uma sessão (a minha live, uma live que assisto ou a call).
type Report struct {
	// SessionID: UUID gerado no app no começo da sessão.
	SessionID string `json:"session_id"`
	Kind      string `json:"kind"`
	CallID    string `json:"call_id"`
	// StreamerID: de quem é a live (assiste).
	StreamerID string        `json:"streamer_id"`
	Context    ClientContext `json:"context"`
	Sample     *Sample       `json:"sample"`
	Events     []Event       `json:"events"`
	// Ended: última amostra (parou de transmitir/assistir, saiu da call).
	Ended bool `json:"ended"`
}

type ClientContext struct {
	OS         string `json:"os"`
	AppVersion string `json:"app_version"`
	// Target: desktop, web ou android.
	Target string `json:"target"`
	// GPU: o renderer do WebGL ("ANGLE (NVIDIA, GeForce RTX 3070 ...)").
	GPU string `json:"gpu"`
	// Network: navigator.connection.effectiveType/type, quando o navegador conta.
	Network string `json:"network"`
	// Cores: núcleos lógicos do processador.
	Cores int `json:"cores"`
	// Device: fabricante e modelo do celular (só o app Android; ADR 0070).
	Device string `json:"device"`
}

// Sample: uma leitura. Contadores = diferença no intervalo de Seconds.
type Sample struct {
	Seconds      float64  `json:"seconds"`
	Codec        string   `json:"codec"`
	Hardware     *bool    `json:"hardware"`
	Width        *int     `json:"width"`
	Height       *int     `json:"height"`
	FPS          *float64 `json:"fps"`
	TargetHeight *int     `json:"target_height"`
	TargetFPS    *int     `json:"target_fps"`
	BitrateKbps  *int     `json:"bitrate_kbps"`
	// Limitation: qualityLimitationReason (cpu, bandwidth, other, none).
	Limitation  string   `json:"limitation"`
	Step        *int     `json:"step"`
	StepChanges int      `json:"step_changes"`
	Layers      *int     `json:"layers"`
	Backup      *bool    `json:"backup"`
	LossPct     *float64 `json:"loss_pct"`
	JitterMs    *float64 `json:"jitter_ms"`
	RTTMs       *float64 `json:"rtt_ms"`
	Freezes     int      `json:"freezes"`
	FreezeMs    int      `json:"freeze_ms"`
	Dropped     int      `json:"frames_dropped"`
	KeyFrames   int      `json:"key_frames"`
	PLI         int      `json:"pli"`
	NACK        int      `json:"nack"`
	// Transport: udp, tcp ou relay (par ICE escolhido).
	Transport string `json:"transport"`
	// Paused: o servidor pausou a live (conexão fraca de quem assiste).
	Paused bool `json:"paused"`
	// Sinais de qualidade (ADR 0032; migration 000176): onde os quadros da
	// live se perdem e o que a voz da call faz com o áudio recebido.
	CaptureFPS   *float64 `json:"capture_fps"`
	RecvFPS      *float64 `json:"recv_fps"`
	CodecMs      *float64 `json:"codec_ms"`
	ConcealedPct *float64 `json:"concealed_pct"`
	RecvLossPct  *float64 `json:"recv_loss_pct"`
	ConnectMs    *int     `json:"connect_ms"`
}

type Event struct {
	Type   string `json:"type"`
	Detail string `json:"detail"`
}
