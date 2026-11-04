import { onWsEvent } from '../../../shared/api/ws'
import { useServerStore } from '../../servers/store/serverStore'
import { useSettingsStore } from '../../settings/store/settingsStore'
import { useMemberProfileStore } from '../store/memberProfileStore'
import { useProfileEditorScopeStore } from '../store/profileEditorScopeStore'
import { handleMemberProfileEvent, type MemberProfileEventDeps } from './memberProfileEvents'

const liveDeps: MemberProfileEventDeps = {
  apply: (serverId, userId, profile) => useMemberProfileStore.getState().apply(serverId, userId, profile),
  forgetServer: (serverId) => useMemberProfileStore.getState().forgetServer(serverId)
}

/**
 * Mantém os perfis de servidor em dia: a lista de membros do servidor aberto
 * (sem campo novo no serverStore: quem observa é este store) e os eventos de
 * todos os servidores da pessoa. Chamado uma vez na entrada; devolve o
 * "desligar".
 */
export function startMemberProfilesSync(): () => void {
  const offWs = onWsEvent((event) => handleMemberProfileEvent(event, liveDeps))
  const offMembers = useServerStore.subscribe((state, prev) => {
    if (state.currentMembers === prev.currentMembers || !state.currentServer) return
    useMemberProfileStore.getState().ingestMembers(state.currentServer.id, state.currentMembers)
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
