import type { ServerEvent } from '../api/events'

// Operações puras sobre a lista de eventos de um servidor. A lista fica sempre
// ordenada pela ocorrência mais próxima (e pelo id, para desempatar), como o
// backend a devolve.

function byNextStart(a: ServerEvent, b: ServerEvent): number {
  const diff = Date.parse(a.next_start_at) - Date.parse(b.next_start_at)
  return diff !== 0 ? diff : a.id.localeCompare(b.id)
}

/** Insere o evento ou troca o de mesmo id, mantendo a ordem. */
export function upsertEvent(list: ServerEvent[], event: ServerEvent): ServerEvent[] {
  return [...list.filter((e) => e.id !== event.id), event].sort(byNextStart)
}

export function removeEvent(list: ServerEvent[], eventId: string): ServerEvent[] {
  return list.filter((e) => e.id !== eventId)
}

function mapEvent(
  list: ServerEvent[],
  eventId: string,
  change: (e: ServerEvent) => ServerEvent
): ServerEvent[] {
  if (!list.some((e) => e.id === eventId)) return list
  return list.map((e) => (e.id === eventId ? change(e) : e))
}

/** Aplica a minha resposta (true = vou, false = não vou, null = tirei) e acerta a contagem. */
export function applyRsvp(
  list: ServerEvent[],
  eventId: string,
  going: boolean | null
): ServerEvent[] {
  return mapEvent(list, eventId, (e) => {
    const delta = (going === true ? 1 : 0) - (e.my_rsvp === true ? 1 : 0)
    return { ...e, my_rsvp: going, going_count: Math.max(0, e.going_count + delta) }
  })
}

/** Troca só a contagem de quem vai (aviso de outra pessoa); a minha resposta fica. */
export function setGoingCount(list: ServerEvent[], eventId: string, count: number): ServerEvent[] {
  return mapEvent(list, eventId, (e) => ({ ...e, going_count: count }))
}
