import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import {
  cancelEvent,
  clearRsvp,
  createEvent,
  fetchEvents,
  setRsvp,
  updateEvent,
  type EventInput,
  type ServerEvent
} from '../api/events'
import { applyRsvp, removeEvent, setGoingCount, upsertEvent } from '../lib/eventList'

// Eventos dos servidores que a pessoa já abriu. Cada servidor carrega uma vez;
// depois só os avisos do ws (event:*) e as ações dela mexem na lista. Servidor
// que ainda não foi carregado ignora os avisos (carrega do zero ao abrir).

interface EventsState {
  byServer: Record<string, ServerEvent[]>
  load: (serverId: string) => Promise<void>
  create: (serverId: string, input: EventInput) => Promise<ServerEvent>
  update: (serverId: string, eventId: string, input: EventInput) => Promise<ServerEvent>
  cancel: (serverId: string, eventId: string) => Promise<void>
  /** true = vou, false = não vou, null = tirar a resposta. Otimista, com volta se falhar. */
  respond: (serverId: string, eventId: string, going: boolean | null) => Promise<void>
  handleWsEvent: (event: WsEvent) => boolean
}

interface WsPayload {
  server_id?: string
  event_id?: string
  going_count?: number
  id?: string
}

export const useEventsStore = create<EventsState>((set, get) => {
  const edit = (serverId: string, change: (list: ServerEvent[]) => ServerEvent[]): void =>
    set((s) => ({ byServer: { ...s.byServer, [serverId]: change(s.byServer[serverId] ?? []) } }))

  const loaded = (serverId: string | undefined): serverId is string =>
    serverId !== undefined && get().byServer[serverId] !== undefined

  const handlers: Record<string, (p: WsPayload) => void> = {
    'event:create': (p) => {
      if (loaded(p.server_id)) edit(p.server_id, (l) => upsertEvent(l, p as unknown as ServerEvent))
    },
    // O aviso não traz a minha resposta: recarrega o servidor.
    'event:update': (p) => {
      if (loaded(p.server_id)) void get().load(p.server_id).catch(() => {})
    },
    'event:delete': (p) => {
      if (loaded(p.server_id) && p.event_id) edit(p.server_id, (l) => removeEvent(l, p.event_id!))
    },
    'event:rsvp': (p) => {
      if (loaded(p.server_id) && p.event_id && typeof p.going_count === 'number') {
        edit(p.server_id, (l) => setGoingCount(l, p.event_id!, p.going_count!))
      }
    }
  }

  return {
    byServer: {},

    load: async (serverId) => {
      const events = await fetchEvents(serverId)
      edit(serverId, () => events)
    },

    create: async (serverId, input) => {
      const created = await createEvent(serverId, input)
      edit(serverId, (l) => upsertEvent(l, created))
      return created
    },

    update: async (serverId, eventId, input) => {
      const updated = await updateEvent(serverId, eventId, input)
      edit(serverId, (l) => upsertEvent(l, updated))
      return updated
    },

    cancel: async (serverId, eventId) => {
      await cancelEvent(serverId, eventId)
      edit(serverId, (l) => removeEvent(l, eventId))
    },

    respond: async (serverId, eventId, going) => {
      const before = get().byServer[serverId] ?? []
      edit(serverId, (l) => applyRsvp(l, eventId, going))
      try {
        await (going === null ? clearRsvp(serverId, eventId) : setRsvp(serverId, eventId, going))
      } catch (err) {
        edit(serverId, () => before)
        throw err
      }
    },

    handleWsEvent: (event) => {
      const handle = handlers[event.type]
      if (!handle) return false
      handle((event.payload ?? {}) as WsPayload)
      return true
    }
  }
})

/** Volta ao estado inicial (logout e testes). */
export function resetEventsStore(): void {
  useEventsStore.setState({ byServer: {} })
}
