// Datas do evento no horário local do aparelho, no formato dos campos
// <input type="datetime-local"> e <input type="date">. O servidor guarda ISO.

const pad = (n: number): string => String(n).padStart(2, '0')

const LOCAL_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/

/** ISO → "AAAA-MM-DD" local (campo de data). */
export function toLocalDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** ISO → "AAAA-MM-DDTHH:mm" local (campo de data e hora). */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  return `${toLocalDate(iso)}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** "AAAA-MM-DDTHH:mm" local → ISO; null se vazio ou inválido. */
export function fromLocalInput(value: string): string | null {
  if (!LOCAL_DATE_TIME.test(value)) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** "AAAA-MM-DD" → ISO do último minuto desse dia (hora local); null se inválido. */
export function endOfLocalDay(date: string): string | null {
  return LOCAL_DATE.test(date) ? fromLocalInput(`${date}T23:59`) : null
}

const WHEN = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit'
})

/** "qua., 4 de nov. 20:30": o dia e a hora do evento para o cartão. */
export function formatWhen(iso: string): string {
  return WHEN.format(new Date(iso))
}

const HOUR_MINUTE = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })

/** "22:30": a hora em que a sala fecha (início + duração). */
export function endTimeLabel(startIso: string, minutes: number): string {
  return HOUR_MINUTE.format(new Date(Date.parse(startIso) + minutes * 60_000))
}
