import { onWsEvent } from '../../../shared/api/ws'
import { useServerStore } from '../../servers/store/serverStore'
import { useSettingsStore } from '../../settings/store/settingsStore'
import { useServerProfileStore } from '../store/serverProfileStore'
import { useProfileEditorScopeStore } from '../store/profileEditorScopeStore'
import { handleServerProfileEvent, type ServerProfileEventDeps } from './serverProfileEvents'

const liveDeps: ServerProfileEventDeps = {
  apply: (serverId, userId, profile) => useServerProfileStore.getState().apply(serverId, userId, profile),
  forgetServer: (serverId) => useServerProfileStore.getState().forgetServer(serverId)
}

/**
 * Mantém os perfis de servidor em dia: a lista de membros do servidor aberto
 * (sem campo novo no serverStore: quem observa é este store) e os eventos de
 * todos os servidores da pessoa. Chamado uma vez na entrada; devolve o
 * "desligar".
 */
export function startServerProfilesSync(): () => void {
  const offWs = onWsEvent((event) => handleServerProfileEvent(event, liveDeps))
  const offMembers = useServerStore.subscribe((state, prev) => {
    if (state.currentMembers === prev.currentMembers || !state.currentServer) return
    useServerProfileStore.getState().ingestMembers(state.currentServer.id, state.currentMembers)
  })
  const offSettings = useSettingsStore.subscribe((state, prev) => {
    if (prev.open && !state.open) useProfileEditorScopeStore.getState().setServerId(null)
  })
  return () => {
    offWs()
    offMembers()
    offSettings()
  }
}
