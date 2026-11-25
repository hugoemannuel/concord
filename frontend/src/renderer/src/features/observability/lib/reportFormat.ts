// Painel de observabilidade das lives: rótulos e geometria dos gráficos. Puro.

const decimal = (value: number, digits: number): string =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

export function durationLabel(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} s`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min`
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`
}

/** Fração (0–1) em porcentagem. */
export function pctLabel(ratio: number | null | undefined): string {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`
}

export function numberLabel(value: number | null | undefined, digits = 1): string {
  return value == null ? '—' : decimal(value, digits)
}

const KINDS: Record<string, string> = {
  transmite: 'Transmitindo',
  assiste: 'Assistindo',
  call: 'Call'
}

export function kindLabel(kind: string): string {
  return KINDS[kind] ?? kind
}

const EVENTS: Record<string, string> = {
  inicio: 'Começou',
  fim: 'Terminou',
  degrau_caiu: 'Qualidade caiu',
  degrau_subiu: 'Qualidade voltou',
  reserva_ligada: 'Reserva ligada',
  encoder_software: 'Codificando no processador',
  decoder_software: 'Decodificando no processador',
  congelamento_longo: 'Congelamento longo',
  pausada_pelo_servidor: 'Pausada pelo servidor',
  codec_trocou: 'Codec trocou',
  codec_escolhido: 'Codec escolhido',
  conexao_falhou: 'Voz não conectou',
  reconectou: 'Voz reconectou',
  retomou: 'Voltou à call (o app reiniciou)',
  // Só do app Android (docs/adr/0070).
  segundo_plano: 'Saiu do app',
  primeiro_plano: 'Voltou ao app',
  rede_trocou: 'Trocou de rede',
  rota_do_audio: 'Saída do áudio'
}

// A falha na etapa de acesso (chamada encerrada, sem permissão) não é queda
// (telemetryConnection.ts, wherePhase; o backend a separa do mesmo jeito).
const ACCESS_FAILURE = 'entrando (acesso)'

export function eventLabel(type: string, detail = ''): string {
  if (type === 'conexao_falhou' && detail.startsWith(ACCESS_FAILURE)) return 'Sem acesso à chamada'
  return EVENTS[type] ?? type
}

const PLATFORMS: Record<string, string> = {
  desktop: 'Desktop',
  web: 'Navegador',
  android: 'App Android'
}

/**
 * "App Android · samsung SM-A515F · wifi": de onde veio a sessão (docs/adr/0070). A rede só no
 * Android: no desktop/web é a estimativa de velocidade do navegador (4g mesmo no Wi-Fi).
 */
export function platformLabel(s: { target: string; device: string; network: string }): string {
  const network = s.target === 'android' ? s.network : ''
  const parts = [PLATFORMS[s.target] ?? 'plataforma desconhecida', s.device, network]
  return parts.filter(Boolean).join(' · ')
}

/** Os sinais da ADR 0032 de uma sessão (o que qualityLine lê). */
export interface QualitySignals {
  kind: string
  fps: number | null
  capture_fps: number | null
  recv_fps: number | null
  codec_ms: number | null
  concealed_pct: number | null
  recv_loss_pct: number | null
  connect_ms: number | null
  reconnects: number
  failures: number
  bad_minutes?: number
  access_failures?: number
}

type Part = [value: number | null, label: (v: string) => string, digits?: number]

const positive = (n: number): number | null => (n > 0 ? n : null)

function partsOf(s: QualitySignals): Part[] {
  if (s.kind === 'call') {
    return [
      [s.concealed_pct, (v) => `Áudio sintetizado ${v}%`],
      [s.recv_loss_pct, (v) => `perda recebida ${v}%`],
      [positive(s.bad_minutes ?? 0), (v) => `${v} min de voz ruim`, 0],
      [s.connect_ms === null ? null : s.connect_ms / 1000, (v) => `entrou em ${v} s`],
      [positive(s.reconnects), (v) => `${v} ${s.reconnects === 1 ? 'reconexão' : 'reconexões'}`, 0],
      [positive(s.failures), (v) => `${v} ${s.failures === 1 ? 'falha' : 'falhas'}`, 0],
      [positive(s.access_failures ?? 0), (v) => `${v} sem acesso à chamada`, 0]
    ]
  }
  const [first, second] =
    s.kind === 'transmite' ? ['Captura', 'codificado'] : ['Chegam', 'decodificados']
  const head = s.kind === 'transmite' ? s.capture_fps : s.recv_fps
  return [
    [head, (v) => `${first} ${v} fps`, 0],
    [head === null ? null : s.fps, (v) => `${second} ${v} fps`, 0],
    [s.codec_ms, (v) => `${v} ms/quadro`]
  ]
}

/**
 * Onde os quadros se perdem (captura × codificado; chegam × decodificados) ou
 * como foi a voz (áudio sintetizado, perda, entrada, quedas). null sem dado.
 */
export function qualityLine(s: QualitySignals): string | null {
  const parts = partsOf(s).filter(([value]) => value !== null)
  if (parts.length === 0) return null
  const text = parts
    .map(([value, label, digits = 1]) => label(decimal(value as number, digits)))
    .join(' · ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/** Teto do eixo: 1, 2, 2,5 ou 5 × 10ⁿ logo acima do maior valor. */
export function niceMax(values: (number | null)[]): number {
  const top = Math.max(0, ...values.map((v) => v ?? 0))
  if (top <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(top))
  const step = [1, 1.5, 2, 2.5, 5, 10].find((m) => m * magnitude >= top) ?? 10
  return step * magnitude
}

/** Caminho SVG da série; valor null = lacuna (o LiveKit não respondeu). */
export function chartPath(
  values: (number | null)[],
  width: number,
  height: number,
  max: number
): string {
  const step = values.length > 1 ? width / (values.length - 1) : 0
  let path = ''
  let pen = false
  values.forEach((value, i) => {
    if (value === null) {
      pen = false
      return
    }
    const x = Math.round(i * step * 10) / 10
    const y = Math.round((height - (Math.min(value, max) / max) * height) * 10) / 10
    path += `${pen ? 'L' : 'M'}${x},${y}`
    pen = true
  })
  return path
}

/** Índice do ponto mais perto de x (−1 sem pontos). */
export function nearestIndex(x: number, width: number, count: number): number {
  if (count <= 0) return -1
  if (count === 1) return 0
  const i = Math.round((x / width) * (count - 1))
  return Math.max(0, Math.min(count - 1, i))
}
