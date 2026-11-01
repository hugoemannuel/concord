import { onWsEvent } from '../../../shared/api/ws'
import { useSavedProfilesStore } from '../store/savedProfilesStore'
import { handleSavedProfilesEvent, type SavedProfilesEventDeps } from './savedProfilesEvents'

const liveDeps: SavedProfilesEventDeps = {
  refresh: () => void useSavedProfilesStore.getState().sync()
}

/**
 * Mantém a lista de perfis salvos em dia entre os aparelhos da pessoa
 * (saved_profiles:changed do WS). Chamado uma vez na entrada do app; devolve
 * o "desligar".
 */
export function startSavedProfilesSync(): () => void {
  return onWsEvent((event) => handleSavedProfilesEvent(event, liveDeps))
}
