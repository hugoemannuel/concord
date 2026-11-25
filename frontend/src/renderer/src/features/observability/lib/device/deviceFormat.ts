// Painel dos aparelhos: rótulos e a linha de números de cada pessoa. Puro.

const DASH = '—'

const decimal = (value: number, digits = 1): string =>
  value.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: 0 })

/** % da máquina inteira (já vem em %, não em fração). */
export function cpuLabel(pct: number | null | undefined): string {
  return pct == null ? DASH : `${decimal(pct)}%`
}

/** MB; de 1 GB para cima, GB com uma casa. */
export function mbLabel(mb: number | null | undefined): string {
  if (mb == null) return DASH
  return mb < 1024 ? `${decimal(mb, 0)} MB` : `${decimal(mb / 1024)} GB`
}

/** ms; de 1 s para cima, s com uma casa. */
export function msLabel(ms: number | null | undefined): string {
  if (ms == null) return DASH
  return ms < 1000 ? `${decimal(ms, 0)} ms` : `${decimal(ms / 1000)} s`
}

/** Tempo travado por minuto visível. */
export function perMinLabel(ms: number | null | undefined): string {
  return ms == null ? DASH : `${msLabel(ms)}/min`
}

const STATES: Record<string, string> = {
  parado: 'Parado',
  call: 'Em call',
  transmitindo: 'Transmitindo'
}

export function stateLabel(state: string): string {
  return STATES[state] ?? state
}

/** "1.40.0 · desktop". */
export function versionLabel(version: string, target: string): string {
  return [version, target].filter(Boolean).join(' · ') || DASH
}

const plural = (n: number, one: string, many: string): string =>
  `${decimal(n, 0)} ${n === 1 ? one : many}`

/** "12 pessoas · 3.400 linhas no período". */
export function summaryLine(people: number, samples: number): string {
  return `${plural(people, 'pessoa', 'pessoas')} · ${plural(samples, 'linha', 'linhas')} no período`
}

/**
 * O nome da placa a partir do renderer do ANGLE: "ANGLE (NVIDIA, NVIDIA
 * GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)" → "NVIDIA GeForce RTX 3070".
 * Fora do ANGLE, fica como veio.
 */
export function gpuShortName(renderer: string): string {
  const raw = renderer.trim()
  const inner = /^ANGLE \((.*)\)$/.exec(raw)?.[1]
  if (inner === undefined) return raw || DASH
  const parts = inner.split(', ')
  const name = (parts[1] ?? parts[0])
    .replace(/\s*\(0x[0-9a-f]+\)/gi, '')
    .replace(/\s+Direct3D.*$/, '')
    .replace(/^ANGLE Metal Renderer:\s*/, '')
    .trim()
  return name || DASH
}

/** Os números de uma pessoa que entram na linha (ver DeviceWorstRow). */
export interface DeviceNumbers {
  cpu_app: number | null
  cpu_renderer_call: number | null
  mem_app_mb: number | null
  mem_free_min_mb: number | null
  mem_total_mb: number | null
  lag_p95_ms: number | null
  long_ms_per_min: number | null
  hangs: number
  startup_ms: number | null
}

type Part = [value: number | null, label: (v: number) => string]

function freeMemory(free: number, total: number | null): string {
  return total == null
    ? `livre mín. ${mbLabel(free)}`
    : `livre mín. ${mbLabel(free)} de ${mbLabel(total)}`
}

function partsOf(n: DeviceNumbers): Part[] {
  return [
    [n.cpu_app, (v) => `CPU do app ${cpuLabel(v)}`],
    [n.cpu_renderer_call, (v) => `renderer em call ${cpuLabel(v)}`],
    [n.mem_app_mb, (v) => `memória do app ${mbLabel(v)}`],
    [n.mem_free_min_mb, (v) => freeMemory(v, n.mem_total_mb)],
    [n.lag_p95_ms, (v) => `atraso p95 ${msLabel(v)}`],
    [n.long_ms_per_min, (v) => `travadas ${perMinLabel(v)}`],
    [n.hangs > 0 ? n.hangs : null, (v) => `janela parou ${plural(v, 'vez', 'vezes')}`],
    [n.startup_ms, (v) => `abertura ${msLabel(v)}`]
  ]
}

/** "CPU do app 18,2% · memória do app 1,4 GB · …"; pula o que não foi medido. */
export function deviceLine(n: DeviceNumbers): string {
  return partsOf(n)
    .filter((part): part is [number, Part[1]] => part[0] !== null)
    .map(([value, label]) => label(value))
    .join(' · ')
}
