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

export interface LiveReport {
  from: string
  to: string
  bucket_minutes: number
  server: ServerPoint[]
  lives: LiveRow[]
  worst: WorstRow[]
  breakdown: Record<
    'os' | 'gpu' | 'codec' | 'transport' | 'target' | 'network' | 'device',
    BreakdownRow[]
  >
  events: EventRow[]
}

export function fetchLiveReport(days: number): Promise<LiveReport> {
  return request<LiveReport>(`/obs/lives?days=${days}`)
}
