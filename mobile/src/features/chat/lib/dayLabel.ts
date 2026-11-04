import { dayKey } from './messageGroups'

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro'
]

/** "2026-10-28" → "28 de outubro de 2026" (sem passar por Date: não depende de fuso). */
export function dayLabelText(day: string): string {
  const [year, month, date] = day.split('-').map(Number)
  return `${date} de ${MONTHS[month - 1]} de ${year}`
}

/** Hora e minuto (24 h) de uma data ISO, no fuso do aparelho (ou no pedido). */
export function timeText(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone }).format(
    new Date(iso)
  )
}

/** Dia anterior de um "AAAA-MM-DD" (conta de calendário, sem fuso nem horário de verão). */
function previousDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10)
}

/**
 * Horário ao lado do nome: hoje só "19:54"; ontem "Ontem às 19:54"; antes
 * disso (ou no futuro, se o relógio estiver errado) "02/11/2026 19:54".
 */
export function timeLabel(iso: string, now: Date, timeZone?: string): string {
  if (Number.isNaN(Date.parse(iso))) return ''
  const day = dayKey(iso, timeZone)
  const today = dayKey(now.toISOString(), timeZone)
  const time = timeText(iso, timeZone)
  if (day === today) return time
  if (day === previousDay(today)) return `Ontem às ${time}`
  const [year, month, date] = day.split('-')
  return `${date}/${month}/${year} ${time}`
}
