import { onWsEvent } from '../../../shared/api/ws'
import { useConnectionStore } from '../../../shared/store/connectionStore'
import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../store/callStore'
import { useRecentArrivalsStore } from '../store/recentArrivalsStore'
import { handleArrivalEvent, type ArrivalEventDeps } from './arrivalEvents'

const liveDeps: ArrivalEventDeps = {
  call: () => useCallStore.getState(),
  meId: () => useAuthStore.getState().user?.id,
  join: (channelId, userId, meId) => useRecentArrivalsStore.getState().join(channelId, userId, meId),
  leave: (channelId, userId) => useRecentArrivalsStore.getState().leave(channelId, userId)
}

/**
 * Liga o selo "Chegou" nos eventos do WS: quem entra na minha call chega na
 * hora; nos outros canais, pelos call:channel_* da lista do servidor.
 * Com a conexão fora do ar, a próxima lista é só base: quem entrou durante a
 * queda não ganha selo. Chamado uma vez na entrada do app; devolve o "desligar".
 */
export function startArrivalBadges(): () => void {
  const offEvents = onWsEvent((event) => handleArrivalEvent(event, liveDeps))
  const offConnection = useConnectionStore.subscribe((state, prev) => {
    if (state.ws.phase !== prev.ws.phase && state.ws.phase !== 'open') {
      useRecentArrivalsStore.getState().resetBaseline()
    }
  })
  return () => {
    offEvents()
    offConnection()
  }
}
