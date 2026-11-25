// O formato que o backend recebe (POST /api/obs/telemetry; backend/internal/liveobs). Cópia do desktop
// (frontend/.../observability/lib/telemetryTypes.ts) com o aparelho no contexto (docs/adr/0070).

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
  // Sinais da ADR 0074 (mesmo formato do desktop): nulos onde não se aplicam ou o Android não mede.
  /** Transmite: QP médio do intervalo (Δ qpSum / Δ quadros codificados). */
  qp: number | null
  /** 1ª amostra: até a live publicada (transmite) ou até o 1º quadro (assiste). Não medido no Android. */
  start_ms: number | null
  /** Transmite: tamanho do que a captura entrega (media-source). */
  source_width: number | null
  source_height: number | null
  /** Transmite: monitor, window ou browser. O MediaProjection não diz (Android 14 deixa escolher um app). */
  surface: string | null
  /** Call: o processamento do microfone. O app não tem (sem RNNoise nem efeitos). */
  dsp_underrun_pct: number | null
  dsp: string | null
  /** Call: % do áudio tocado que a saída do aparelho sintetizou (media-playout). */
  playout_synth_pct: number | null
  /** Call: a minha câmera enviada e os congelamentos das recebidas. Sem leitura no Android (só o microfone). */
  cam_fps: number | null
  cam_height: number | null
  cam_limitation: string | null
  cam_freezes: number | null
}

export interface TelemetryEvent {
  type: string
  detail: string
}

export interface ClientContext {
  /** "Android 14". */
  os: string
  app_version: string
  /** Sempre 'android' neste app. */
  target: string
  /** Sem API no React Native: vazio. */
  gpu: string
  /** 'wifi', 'cellular-4g', 'none'... (NetInfo). */
  network: string
  /** Sem API no React Native: 0. */
  cores: number
  /** Fabricante e modelo ("samsung SM-A515F"). */
  device: string
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
    connect_ms: null,
    qp: null,
    start_ms: null,
    source_width: null,
    source_height: null,
    surface: null,
    dsp_underrun_pct: null,
    dsp: null,
    playout_synth_pct: null,
    cam_fps: null,
    cam_height: null,
    cam_limitation: null,
    cam_freezes: null
  }
}
