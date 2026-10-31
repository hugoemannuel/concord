import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import { fetchEventAccess, type EventAccess } from '../api/events'

// O que a pessoa pode fazer com os eventos de cada servidor que já abriu. O dono
// muda a configuração dos cargos: o aviso `event:access` faz quem já carregou
// o servidor buscar de novo (a lista de botões muda sem recarregar o app).

interface EventAccessState {
  byServer: Record<string, EventAccess>
  load: (serverId: string) => Promise<void>
  handleWsEvent: (event: WsEvent) => boolean
}

export const useEventAccessStore = create<EventAccessState>((set, get) => ({
  byServer: {},

  load: async (serverId) => {
    try {
      const access = await fetchEventAccess(serverId)
      set((s) => ({ byServer: { ...s.byServer, [serverId]: access } }))
    } catch {
      // Sem resposta, vale o que já havia (ou nada: o app esconde os botões).
    }
  },

  handleWsEvent: (event) => {
    if (event.type !== 'event:access') return false
    const serverId = (event.payload as { server_id?: string } | undefined)?.server_id
    if (serverId && get().byServer[serverId]) void get().load(serverId)
    return true
  }
}))

/** Volta ao estado inicial (logout e testes). */
export function resetEventAccessStore(): void {
  useEventAccessStore.setState({ byServer: {} })
}
