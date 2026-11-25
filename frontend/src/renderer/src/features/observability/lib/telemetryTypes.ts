// O formato que o backend recebe (POST /api/obs/telemetry; internal/liveobs).

export type SessionKind = 'transmite' | 'assiste' | 'call'

export interface TelemetrySample {
  seconds: number
  codec: string
  hardware: boolean | null
  width: number | null
  height: number | null
  fps: number | null
  target_height: number | null
  target_fps: number | null
  bitrate_kbps: number | null
  limitation: string
  step: number | null
  step_changes: number
  layers: number | null
  backup: boolean | null
  loss_pct: number | null
  jitter_ms: number | null
  rtt_ms: number | null
  freezes: number
  freeze_ms: number
  frames_dropped: number
  key_frames: number
  pli: number
  nack: number
  transport: string
  paused: boolean
  // Sinais de qualidade (docs/adr/0032): onde os quadros da live se perdem e
  // o que a voz faz com o áudio recebido.
  /** Transmite: quadros/s que a captura entregou. */
  capture_fps: number | null
  /** Assiste: quadros/s que chegaram (antes de decodificar). */
  recv_fps: number | null
  /** ms por quadro no codificador (transmite) ou decodificador (assiste). */
  codec_ms: number | null
  /** Call: % do áudio recebido que foi sintetizado (voz robotizada/cortes). */
  concealed_pct: number | null
  /** Call: perda no áudio que eu recebo. */
  recv_loss_pct: number | null
  /** Call: ms do "entrar" até a voz conectar (só na amostra seguinte). */
  connect_ms: number | null
}

export interface TelemetryEvent {
  type: string
  detail: string
  /** Há quanto tempo aconteceu, em ms (o servidor grava a hora do fato). */
  ago_ms?: number
}

export interface ClientContext {
  os: string
  app_version: string
  target: string
  gpu: string
  network: string
  /** Núcleos lógicos do processador (navigator.hardwareConcurrency). */
  cores: number
}

export interface TelemetryReport {
  session_id: string
  kind: SessionKind
  call_id: string
  streamer_id: string
  context: ClientContext
  sample: TelemetrySample | null
  events: TelemetryEvent[]
  ended: boolean
  /** Há quanto tempo o relatório foi montado (reenvio depois de uma falha). */
  ago_ms?: number
}

export function emptySample(): TelemetrySample {
  return {
    seconds: 0,
    codec: '',
    hardware: null,
    width: null,
    height: null,
    fps: null,
    target_height: null,
    target_fps: null,
    bitrate_kbps: null,
    limitation: '',
    step: null,
    step_changes: 0,
    layers: null,
    backup: null,
    loss_pct: null,
    jitter_ms: null,
    rtt_ms: null,
    freezes: 0,
    freeze_ms: 0,
    frames_dropped: 0,
    key_frames: 0,
    pli: 0,
    nack: 0,
    transport: '',
    paused: false,
    capture_fps: null,
    recv_fps: null,
    codec_ms: null,
    concealed_pct: null,
    recv_loss_pct: null,
    connect_ms: null
  }
}
