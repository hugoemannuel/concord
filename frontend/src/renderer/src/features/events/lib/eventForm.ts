import type { EventInput, ServerEvent } from '../api/events'
import { DEFAULT_DURATION } from './duration'
import { NO_GAME, gameChoiceOf, gameNameOf } from './eventGame'
import { endOfLocalDay, fromLocalInput, toLocalDate, toLocalInput } from './eventTime'
import type { Recurrence } from './recurrence'
import { DEFAULT_REMINDERS } from './reminders'

// O formulário de criar e editar evento: valores como o usuário digita
// (texto dos campos) e a conversão, com validação, para o pedido da API.

export const MAX_TITLE = 100
export const MAX_DESCRIPTION = 1000
export const MAX_GAME = 64

export type EndMode = 'never' | 'until' | 'count'

export interface EventFormValues {
  title: string
  description: string
  /** "AAAA-MM-DDTHH:mm", horário local. */
  startsAt: string
  durationMinutes: number
  /** Opção do seletor de jogo: NO_GAME, um jogo do catálogo ou OTHER_GAME. */
  gameChoice: string
  /** O nome digitado quando a opção é "Outro jogo…". */
  customGame: string
  recurrence: Recurrence
  endMode: EndMode
  /** "AAAA-MM-DD", horário local. */
  until: string
  count: string
  reminders: number[]
  bannerId: string | null
}

export type FormResult = { ok: true; input: EventInput } | { ok: false; error: string }

const fail = (error: string): FormResult => ({ ok: false, error })

/** Formulário em branco: começa na próxima hora cheia, com a duração e os lembretes padrão. */
export function emptyForm(now: Date = new Date()): EventFormValues {
  const start = new Date(now)
  start.setMinutes(0, 0, 0)
  start.setHours(start.getHours() + 1)
  return {
    title: '',
    description: '',
    startsAt: toLocalInput(start.toISOString()),
    durationMinutes: DEFAULT_DURATION,
    gameChoice: NO_GAME,
    customGame: '',
    recurrence: 'none',
    endMode: 'never',
    until: '',
    count: '',
    reminders: [...DEFAULT_REMINDERS],
    bannerId: null
  }
}

function endModeOf(event: ServerEvent): EndMode {
  if (event.recurrence_until) return 'until'
  return event.recurrence_count ? 'count' : 'never'
}

/** Preenche o formulário de edição com os dados do evento. */
export function formFromEvent(event: ServerEvent): EventFormValues {
  return {
    title: event.title,
    description: event.description,
    startsAt: toLocalInput(event.starts_at),
    durationMinutes: event.duration_minutes,
    gameChoice: gameChoiceOf(event.game_name).choice,
    customGame: gameChoiceOf(event.game_name).custom,
    recurrence: event.recurrence,
    endMode: endModeOf(event),
    until: event.recurrence_until ? toLocalDate(event.recurrence_until) : '',
    count: event.recurrence_count ? String(event.recurrence_count) : '',
    reminders: [...event.reminder_offsets],
    bannerId: event.banner_id
  }
}

/** O jogo "Outro jogo…" sem nome, ou com nome grande demais. */
function gameError(v: EventFormValues): string | null {
  const name = gameNameOf(v.gameChoice, v.customGame)
  if (v.gameChoice !== NO_GAME && !name) return 'Digite o nome do jogo.'
  return name.length > MAX_GAME ? `O nome do jogo pode ter até ${MAX_GAME} caracteres.` : null
}

function textError(v: EventFormValues): string | null {
  const title = v.title.trim()
  if (!title) return 'Dê um título ao evento.'
  if (title.length > MAX_TITLE) return `O título pode ter até ${MAX_TITLE} caracteres.`
  if (v.description.trim().length > MAX_DESCRIPTION) {
    return `A descrição pode ter até ${MAX_DESCRIPTION} caracteres.`
  }
  return null
}

interface End {
  until: string | null
  count: number | null
}

/** O fim da repetição; texto de erro se estiver incompleto ou fora de ordem. */
function parseEnd(v: EventFormValues, startIso: string): End | string {
  if (v.recurrence === 'none' || v.endMode === 'never') return { until: null, count: null }
  if (v.endMode === 'count') {
    const count = /^\d+$/.test(v.count) ? Number(v.count) : 0
    return count >= 1 ? { until: null, count } : 'Informe quantas vezes repete (1 ou mais).'
  }
  const until = endOfLocalDay(v.until)
  if (!until) return 'Informe até quando o evento repete.'
  return Date.parse(until) > Date.parse(startIso)
    ? { until, count: null }
    : 'A repetição precisa terminar depois do início.'
}

function startError(startIso: string | null, now: Date, running: boolean): string | null {
  if (!startIso) return 'Escolha a data e a hora de início.'
  // Evento em andamento: o início é o de sempre (já passou) e não muda.
  if (running) return null
  return Date.parse(startIso) > now.getTime() ? null : 'O início precisa estar no futuro.'
}

/** Confere o formulário e monta o pedido da API (ou diz o que está errado). */
export function toInput(v: EventFormValues, now: Date = new Date(), running = false): FormResult {
  const text = textError(v) ?? gameError(v)
  if (text) return fail(text)
  const startIso = fromLocalInput(v.startsAt)
  const start = startError(startIso, now, running)
  if (start || !startIso) return fail(start ?? '')
  const end = parseEnd(v, startIso)
  if (typeof end === 'string') return fail(end)
  return {
    ok: true,
    input: {
      title: v.title.trim(),
      description: v.description.trim(),
      banner_id: v.bannerId,
      starts_at: startIso,
      duration_minutes: v.durationMinutes,
      game_name: gameNameOf(v.gameChoice, v.customGame),
      recurrence: v.recurrence,
      recurrence_until: end.until,
      recurrence_count: end.count,
      reminder_offsets: v.reminders
    }
  }
}
