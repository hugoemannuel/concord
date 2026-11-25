// A linha dos sinais da ADR 0074 numa sessão do painel: a fonte e o motor da
// live, o QP e o tempo até o ar (quem transmite), o primeiro quadro e a tela
// parada descontada (quem assiste), o microfone, a saída de áudio e a câmera
// (a voz). Puro.

/** Os campos que mediaLine lê (ausentes num backend de antes). */
export interface MediaSignals {
  kind: string
  static_freezes?: number
  qp?: number | null
  start_ms?: number | null
  source_height?: number | null
  surface?: string
  engine?: string
  dsp_underrun_pct?: number | null
  dsp?: string
  playout_synth_pct?: number | null
  cam_fps?: number | null
  cam_freezes?: number
  cam_seconds?: number
}

const SURFACES: Record<string, string> = {
  monitor: 'Monitor',
  window: 'Janela',
  browser: 'Aba do navegador'
}

const ENGINES: Record<string, string> = { nativo: 'motor nativo', chromium: 'Chromium' }

const decimal = (value: number, digits = 1): string =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: digits })

const seconds = (ms: number): string => `${decimal(ms / 1000)} s`

/** "Monitor de 1440p", "Janela" ou "1440p". */
function sourceLabel(s: MediaSignals): string | null {
  const surface = s.surface ? (SURFACES[s.surface] ?? s.surface) : null
  const height = s.source_height ? `${Math.round(s.source_height)}p` : null
  if (surface && height) return `${surface} de ${height}`
  return surface ?? height
}

function shareParts(s: MediaSignals): (string | null)[] {
  return [
    sourceLabel(s),
    s.engine ? (ENGINES[s.engine] ?? s.engine) : null,
    s.qp == null ? null : `QP ${Math.round(s.qp)}`,
    s.start_ms == null ? null : `no ar em ${seconds(s.start_ms)}`
  ]
}

function watchParts(s: MediaSignals): (string | null)[] {
  const discounted = s.static_freezes ?? 0
  return [
    s.start_ms == null ? null : `1º quadro em ${seconds(s.start_ms)}`,
    discounted > 0 ? `${discounted} congel. de tela parada descontados` : null
  ]
}

function callParts(s: MediaSignals): (string | null)[] {
  const camSeconds = s.cam_seconds ?? 0
  const camPerMin = camSeconds > 0 ? ((s.cam_freezes ?? 0) * 60) / camSeconds : 0
  const dsp = s.dsp ? ` (${s.dsp})` : ''
  return [
    s.dsp_underrun_pct == null ? null : `microfone atrasou ${decimal(s.dsp_underrun_pct)}%${dsp}`,
    s.playout_synth_pct == null
      ? null
      : `saída de áudio sintetizou ${decimal(s.playout_synth_pct)}%`,
    s.cam_fps == null ? null : `câmera ${Math.round(s.cam_fps)} fps`,
    camPerMin > 0 ? `câmeras recebidas ${decimal(camPerMin)} congel./min` : null
  ]
}

const PARTS: Record<string, (s: MediaSignals) => (string | null)[]> = {
  transmite: shareParts,
  assiste: watchParts,
  call: callParts
}

/** null sem nenhum sinal novo. */
export function mediaLine(s: MediaSignals): string | null {
  const parts = (PARTS[s.kind]?.(s) ?? []).filter((p): p is string => p !== null)
  if (parts.length === 0) return null
  const text = parts.join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
