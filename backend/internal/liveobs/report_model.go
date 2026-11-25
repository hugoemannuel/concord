package liveobs

import "time"

// Painel das lives (GET /api/obs/lives, só devs): o que o time precisa para
// saber onde agir. As sessões vêm agregadas do banco (SessionStats) e o resto
// é montado em Go, puro (report_build.go).

// SessionStats: uma sessão com as amostras resumidas.
type SessionStats struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	Username   string `json:"username"`
	Kind       string `json:"kind"`
	CallID     string `json:"call_id"`
	StreamerID string `json:"streamer_id"`
	OS         string `json:"os"`
	GPU        string `json:"gpu"`
	AppVersion string `json:"app_version"`
	Target     string `json:"target"`
	Cores      int    `json:"cores"`
	// Network e Device: a última rede vista e o celular (ADR 0070).
	Network   string    `json:"network"`
	Device    string    `json:"device"`
	StartedAt time.Time `json:"started_at"`
	EndedAt   time.Time `json:"ended_at"`
	// Seconds: soma dos intervalos medidos (base dos "por minuto").
	Seconds float64 `json:"seconds"`
	Codec   string  `json:"codec"`
	// Transport: o mais visto (udp, tcp, relay).
	Transport string   `json:"transport"`
	FPS       *float64 `json:"fps"`
	TargetFPS *float64 `json:"target_fps"`
	Height    *float64 `json:"height"`
	// Frações do tempo (0–1); nil = sem dado.
	HardwareRatio  *float64 `json:"hardware_ratio"`
	BelowRatio     *float64 `json:"below_ratio"`
	CPURatio       float64  `json:"cpu_ratio"`
	BandwidthRatio float64  `json:"bandwidth_ratio"`
	BackupRatio    float64  `json:"backup_ratio"`
	PausedRatio    float64  `json:"paused_ratio"`
	Freezes        int64    `json:"freezes"`
	FreezeMs       int64    `json:"freeze_ms"`
	StepChanges    int64    `json:"step_changes"`
	BitrateKbps    *float64 `json:"bitrate_kbps"`
	LossPct        *float64 `json:"loss_pct"`
	RTTMs          *float64 `json:"rtt_ms"`
	// Sinais da ADR 0032 (médias das amostras; nil = sem dado).
	CaptureFPS   *float64 `json:"capture_fps"`
	RecvFPS      *float64 `json:"recv_fps"`
	CodecMs      *float64 `json:"codec_ms"`
	ConcealedPct *float64 `json:"concealed_pct"`
	RecvLossPct  *float64 `json:"recv_loss_pct"`
	ConnectMs    *float64 `json:"connect_ms"`
	// Minutos medidos com a voz ruim (a pontuação da voz conta estes, não a
	// média da sessão): áudio sintetizado ≥ 3%, perda recebida ≥ 5% e um ou outro.
	RoboticMinutes float64 `json:"robotic_minutes"`
	LossMinutes    float64 `json:"loss_minutes"`
	BadMinutes     float64 `json:"bad_minutes"`
	// Reconnects e Failures: eventos reconectou e conexao_falhou da sessão
	// (Failures sem as de acesso: AccessFailures, "não tem mais acesso").
	Reconnects     int64 `json:"reconnects"`
	Failures       int64 `json:"failures"`
	AccessFailures int64 `json:"access_failures"`
	// Backgrounds e NetworkChanges: eventos segundo_plano e rede_trocou (ADR 0070).
	Backgrounds    int64 `json:"backgrounds"`
	NetworkChanges int64 `json:"network_changes"`
}

// LiveRow: uma live (sessão de quem transmite) com quem assistiu.
type LiveRow struct {
	SessionStats
	DurationSeconds float64 `json:"duration_seconds"`
	Viewers         int     `json:"viewers"`
	// Congelamentos por minuto de quem assistiu (média ponderada pelo tempo).
	ViewerFreezesPerMin *float64 `json:"viewer_freezes_per_min"`
	// Fração de quem assistiu decodificando no processador.
	ViewerSoftwareRatio *float64 `json:"viewer_software_ratio"`
}

// WorstRow: uma sessão ruim e por quê.
type WorstRow struct {
	SessionStats
	DurationSeconds float64  `json:"duration_seconds"`
	FreezesPerMin   float64  `json:"freezes_per_min"`
	Score           float64  `json:"score"`
	Reasons         []string `json:"reasons"`
}

// BreakdownRow: sessões agrupadas por SO, GPU, codec ou transporte.
type BreakdownRow struct {
	Key           string   `json:"key"`
	Sessions      int      `json:"sessions"`
	BelowRatio    *float64 `json:"below_ratio"`
	FreezesPerMin *float64 `json:"freezes_per_min"`
	SoftwareRatio *float64 `json:"software_ratio"`
}

// ServerPoint: um intervalo da série do LiveKit (médias no intervalo).
type ServerPoint struct {
	At             time.Time `json:"at"`
	Up             bool      `json:"up"`
	MbpsIn         float64   `json:"mbps_in"`
	MbpsOut        float64   `json:"mbps_out"`
	LossInPct      *float64  `json:"loss_in_pct"`
	LossOutPct     *float64  `json:"loss_out_pct"`
	RTTMs          *float64  `json:"rtt_ms"`
	LiveKitCPU     *float64  `json:"livekit_cpu_pct"`
	HostCPU        *float64  `json:"host_cpu_pct"`
	HostMem        *float64  `json:"host_mem_pct"`
	Participants   int       `json:"participants"`
	VideoTracksOut int       `json:"video_tracks_out"`
}

// EventRow: um evento recente.
type EventRow struct {
	At       time.Time `json:"at"`
	Type     string    `json:"type"`
	Detail   string    `json:"detail"`
	Kind     string    `json:"kind"`
	Username string    `json:"username"`
}

// LiveReport: a resposta do painel.
type LiveReport struct {
	From      time.Time     `json:"from"`
	To        time.Time     `json:"to"`
	BucketMin int           `json:"bucket_minutes"`
	Server    []ServerPoint `json:"server"`
	Lives     []LiveRow     `json:"lives"`
	// Worst: as duas listas juntas, para o app de antes (que separa por kind).
	Worst      []WorstRow                `json:"worst"`
	WorstLives []WorstRow                `json:"worst_lives"`
	WorstCalls []WorstRow                `json:"worst_calls"`
	Breakdown  map[string][]BreakdownRow `json:"breakdown"`
	Events     []EventRow                `json:"events"`
}
