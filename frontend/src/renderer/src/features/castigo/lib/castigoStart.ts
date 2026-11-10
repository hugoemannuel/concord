import { onWsEvent } from '../../../shared/api/ws'
import { useCastigoStore } from '../store/castigoStore'
import { handleCastigoEvent, type CastigoEventDeps } from './castigoEvents'

const liveDeps: CastigoEventDeps = {
  upsert: (c) => useCastigoStore.getState().upsert(c),
  setVote: (vote) => useCastigoStore.getState().setVote(vote)
}

/**
 * Liga os castigos e as votações ao WebSocket (castigo:update e castigo:vote).
 * Chamado uma vez na entrada do app; devolve o "desligar".
 */
export function startCastigos(): () => void {
  return onWsEvent((event) => handleCastigoEvent(event, liveDeps))
}
