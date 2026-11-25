import type { ErrorSource } from '../api/errorReports'

// Aba Erros do painel /observabilidade: rótulos e textos curtos. Puro.

/** Filtro de origem do painel, na ordem dos botões ('' = todas). */
export const SOURCE_OPTIONS: { value: ErrorSource | ''; label: string }[] = [
  { value: '', label: 'Todas' },
  { value: 'renderer', label: 'Desktop/web' },
  { value: 'main', label: 'Electron' },
  { value: 'mobile', label: 'Android' },
  { value: 'backend', label: 'Servidor' }
]

export function sourceLabel(source: string): string {
  return SOURCE_OPTIONS.find((o) => o.value !== '' && o.value === source)?.label ?? source
}

const TARGETS: Record<string, string> = {
  desktop: 'Desktop',
  web: 'Web',
  android: 'Android',
  servidor: 'Servidor'
}

export function targetLabel(target: string): string {
  return target === '' ? '—' : (TARGETS[target] ?? target)
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** "agora", "há 5 min", "há 3 h", "há 2 dias" (relógio adiantado também é "agora"). */
export function agoLabel(iso: string, now: number): string {
  const at = Date.parse(iso)
  if (Number.isNaN(at)) return '—'
  const diff = now - at
  if (diff < MINUTE) return 'agora'
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`
  if (diff < DAY) return `há ${Math.floor(diff / HOUR)} h`
  const days = Math.floor(diff / DAY)
  return `há ${days} ${days === 1 ? 'dia' : 'dias'}`
}

/** As primeiras `max` e quantas faltam: "1.4.2, 1.4.1 +2". */
export function shortList(items: string[], max = 2): string {
  if (items.length === 0) return '—'
  const rest = items.length - max
  const head = items.slice(0, max).join(', ')
  return rest > 0 ? `${head} +${rest}` : head
}

const plural = (n: number, one: string, many: string): string =>
  `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`

export const peopleLabel = (n: number): string => plural(n, 'pessoa', 'pessoas')
export const timesLabel = (n: number): string => plural(n, 'vez', 'vezes')

/** "TypeError: x is undefined" (ou só um dos dois). */
export function errorTitle(kind: string, message: string): string {
  if (kind && message) return `${kind}: ${message}`
  return kind || message || 'Erro sem mensagem'
}

/** Se a pessoa estava numa call ou numa live quando o erro aconteceu. */
export function whereLabel(o: { in_call: boolean; in_live: boolean }): string {
  if (o.in_call && o.in_live) return 'Em call e em live'
  if (o.in_call) return 'Em call'
  return o.in_live ? 'Em live' : '—'
}

/** id do botão do grupo na lista (o foco volta para ele ao fechar o detalhe). */
export const groupElementId = (fingerprint: string): string => `erro-grupo-${fingerprint}`

/** A pilha a mostrar: a traduzida pelos source maps, a crua se pedida ou se não houve tradução. */
export function pickStack(
  detail: { stack: string; translated: string },
  raw: boolean
): { text: string; translated: boolean; canToggle: boolean } {
  const canToggle = detail.translated !== ''
  const translated = canToggle && !raw
  return { text: translated ? detail.translated : detail.stack, translated, canToggle }
}
