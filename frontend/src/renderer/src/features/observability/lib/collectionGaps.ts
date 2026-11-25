import type { CollectionGap } from '../api/observability'
import { durationLabel } from './reportFormat'
import { timeLabel } from './timeLabel'

const sameDay = (a: Date, b: Date): boolean =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate()

const hourLabel = (d: Date): string =>
  d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** Um buraco na coleta: início até o fim (o dia só uma vez, se não virou; "agora" se não voltou) · duração. */
export function gapLine(gap: CollectionGap): string {
  const from = new Date(gap.from)
  const to = new Date(gap.to)
  const end = gap.open ? 'agora' : sameDay(from, to) ? hourLabel(to) : timeLabel(gap.to)
  return `${timeLabel(gap.from)} até ${end} · ${durationLabel(gap.minutes * 60)}`
}
