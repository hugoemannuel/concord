/**
 * Datas das mensagens do chat: o separador de dia, o rótulo do horário
 * ("19:54", "Ontem às 19:54", "02/11/2026 19:54") e o texto do tooltip.
 *
 * Tudo é puro e recebe o fuso opcional: sem ele vale o do aparelho (é o que o
 * app usa); com ele os testes não dependem da máquina. O "dia" é sempre o dia
 * civil naquele fuso, nunca o dia em UTC.
 */

const LOCALE = 'pt-BR'
const DAY_MS = 24 * 3_600_000
/** Folga depois da meia-noite, para o relógio já estar no dia novo. */
const TICK_SLACK_MS = 1_000

/** Dia civil "AAAA-MM-DD" da data ISO no fuso; vazio se a data for inválida. */
export function dayKey(iso: string, timeZone?: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

/**
 * A mensagem abre um dia novo (ganha o separador)? A primeira da lista sempre
 * abre. Data inválida nunca desenha separador; anterior inválida não esconde o
 * da mensagem atual.
 */
export function startsNewDay(
  createdAt: string,
  previousCreatedAt: string | undefined,
  timeZone?: string
): boolean {
  const day = dayKey(createdAt, timeZone)
  if (!day) return false
  if (previousCreatedAt === undefined) return true
  return dayKey(previousCreatedAt, timeZone) !== day
}

function format(
  iso: string,
  options: Intl.DateTimeFormatOptions,
  timeZone: string | undefined
): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat(LOCALE, { ...options, timeZone }).format(date)
}

/** Texto do separador: "3 de novembro de 2026". */
export function dayDividerText(iso: string, timeZone?: string): string {
  return format(iso, { day: 'numeric', month: 'long', year: 'numeric' }, timeZone)
}

/** Hora e minuto, "19:54". */
export function clockTime(iso: string, timeZone?: string): string {
  return format(iso, { hour: '2-digit', minute: '2-digit' }, timeZone)
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
export function messageTimeLabel(iso: string, now: Date, timeZone?: string): string {
  const day = dayKey(iso, timeZone)
  if (!day) return ''
  const time = clockTime(iso, timeZone)
  const today = dayKey(now.toISOString(), timeZone)
  if (day === today) return time
  if (day === previousDay(today)) return `Ontem às ${time}`
  const date = format(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }, timeZone)
  return `${date} ${time}`
}

/** Tooltip do horário: dia da semana, data por extenso e hora. */
export function messageDateTitle(iso: string, timeZone?: string): string {
  return format(iso, { dateStyle: 'full', timeStyle: 'short' }, timeZone)
}

/** Milissegundos até a próxima meia-noite do fuso (mais 1 s de folga). */
export function msUntilNextDay(now: Date, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(now)
  const part = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const intoDay = ((part('hour') * 60 + part('minute')) * 60 + part('second')) * 1000
  return DAY_MS - intoDay - (now.getTime() % 1000) + TICK_SLACK_MS
}
