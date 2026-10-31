import type { EventInput, ServerEvent } from '../api/events'
import { eventErrorMessage } from './eventErrors'
import { toInput, type EventFormValues } from './eventForm'
import { isRunning } from './running'

export type SaveResult = { ok: true; event: ServerEvent } | { ok: false; error: string }

/** As duas ações que gravam o evento (as do store dos eventos). */
export interface SaveActions {
  create: (serverId: string, input: EventInput) => Promise<ServerEvent>
  update: (serverId: string, eventId: string, input: EventInput) => Promise<ServerEvent>
}

/**
 * Confere o formulário e grava: cria o evento novo ou edita o existente.
 * Devolve o evento salvo ou o texto do problema (formulário, recusa, rede).
 */
export async function saveEvent(
  serverId: string,
  existing: ServerEvent | undefined,
  values: EventFormValues,
  actions: SaveActions
): Promise<SaveResult> {
  const checked = toInput(values, new Date(), existing ? isRunning(existing) : false)
  if (!checked.ok) return { ok: false, error: checked.error }
  try {
    const event = existing
      ? await actions.update(serverId, existing.id, checked.input)
      : await actions.create(serverId, checked.input)
    return { ok: true, event }
  } catch (err) {
    return { ok: false, error: eventErrorMessage(err) }
  }
}
