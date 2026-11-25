import { request } from '../../../shared/api/client'

// Painel das lives (backend: internal/liveobs, GET /obs/lives; só devs).

export interface SessionStats {
  id: string
  user_id: string
  username: string
  kind: string
  call_id: string
  streamer_id: string
  os: string
  gpu: string
  app_version: string
  target: string
  cores: number
  // Do app Android (docs/adr/0070): a rede mais recente, o aparelho e quantas
  // vezes saiu do app ou trocou de rede.
  network: string
  device: string
  backgrounds: number
  network_changes: number
  started_at: string
  ended_at: string
  seconds: number
  codec: string
  transport: string
  fps: number | null
  target_fps: number | null
  height: number | null
  hardware_ratio: number | null
  below_ratio: number | null
  cpu_ratio: number
  bandwidth_ratio: number
  backup_ratio: number
  paused_ratio: number
  freezes: number
  freeze_ms: number
  step_changes: number
  bitrate_kbps: number | null
  loss_pct: number | null
  rtt_ms: number | null
  // Sinais da ADR 0032 (médias; null = sem dado).
  capture_fps: number | null
  recv_fps: number | null
  codec_ms: number | null
  concealed_pct: number | null
  recv_loss_pct: number | null
  connect_ms: number | null
  reconnects: number
  failures: number
  // Minutos com a voz ruim (sintetizado ≥ 3% ou perda recebida ≥ 5%) e as
  // falhas de acesso (não são queda). Ausentes num backend de antes.
  robotic_minutes?: number
  loss_minutes?: number
  bad_minutes?: number
  access_failures?: number
}

export interface LiveRow extends SessionStats {
  duration_seconds: number
  viewers: number
  viewer_freezes_per_min: number | null
  viewer_software_ratio: number | null
}

export interface WorstRow extends SessionStats {
  duration_seconds: number
  freezes_per_min: number
  score: number
  reasons: string[]
}

export interface BreakdownRow {
  key: string
  sessions: number
  below_ratio: number | null
  freezes_per_min: number | null
  software_ratio: number | null
  /** Pessoas no grupo e as medianas por pessoa (ausentes num backend de antes). */
  people?: number
  below_ratio_median?: number | null
  freezes_per_min_median?: number | null
  software_ratio_median?: number | null
}

export interface ServerPoint {
  at: string
  up: boolean
  mbps_in: number
  mbps_out: number
  loss_in_pct: number | null
  loss_out_pct: number | null
  rtt_ms: number | null
  livekit_cpu_pct: number | null
  host_cpu_pct: number | null
  host_mem_pct: number | null
  participants: number
  video_tracks_out: number
}

export interface EventRow {
  at: string
  type: string
  detail: string
  kind: string
  username: string
}

/** Minutos seguidos sem nenhuma linha do coletor (o backend ou a VPS fora). */
export interface CollectionGap {
  from: string
  to: string
  minutes: number
}

/** O LiveKit começou de novo (at: o início do processo novo). */
export interface LiveKitRestart {
  at: string
  seen_at: string
}

export interface LiveReport {
  from: string
  to: string
  bucket_minutes: number
  server: ServerPoint[]
  lives: LiveRow[]
  /** As duas listas juntas (para o app de antes). */
  worst: WorstRow[]
  /** Piores lives e piores chamadas, cada uma com o seu teto (ausentes num backend de antes). */
  worst_lives?: WorstRow[]
  worst_calls?: WorstRow[]
  breakdown: Record<
    'os' | 'gpu' | 'codec' | 'transport' | 'target' | 'network' | 'device',
    BreakdownRow[]
  >
  events: EventRow[]
  /** Quedas e falhas da voz do período inteiro (ausente num backend de antes). */
  call_events?: EventRow[]
  /** Buracos na coleta e reinícios do LiveKit, do mais recente (ausentes num backend de antes). */
  collection_gaps?: CollectionGap[]
  livekit_restarts?: LiveKitRestart[]
}

export function fetchLiveReport(days: number): Promise<LiveReport> {
  return request<LiveReport>(`/obs/lives?days=${days}`)
}
