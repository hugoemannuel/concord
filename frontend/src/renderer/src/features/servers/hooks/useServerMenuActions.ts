import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { useModerationStore } from '../../call/store/moderationStore'
import { useChatStore } from '../../chat/store/chatStore'
import { useNotifySettingsStore } from '../../notifications/store/notifySettingsStore'
import { useServerLevelModalStore } from '../../serverlevel/store/serverLevelModalStore'
import { useServerCardStore } from '../../serverprofile/store/serverCardStore'
import { useEventsPanelStore } from '../../events/store/eventsPanelStore'
import { openMemberProfileEditor } from '../../memberProfiles/store/profileEditorScopeStore'
import { useUIStore } from '../../../shared/store/uiStore'
import type { ServerMenuData } from '../lib/serverAccessLoad'
import { readServerPatch } from '../lib/markServerRead'
import { buildServerMenuActions, type ServerMenuActions, type ServerMenuDeps } from '../lib/serverMenuActions'
import { useChannelSidebarStore } from '../store/channelSidebarStore'
import { useHideMutedStore } from '../store/hideMutedStore'
import { useServerMenuStore } from '../store/serverMenuStore'
import { useServerSettingsStore } from '../store/serverSettingsStore'
import { useServerStore } from '../store/serverStore'

/** Os stores que cada ação mexe (o que não depende do servidor clicado). */
const STORE_DEPS = {
  openCard: (id: string) => useServerCardStore.getState().open(id),
  openLevel: (id: string) => useServerLevelModalStore.getState().open(id),
  openEvents: (id: string) => useEventsPanelStore.getState().open(id),
  openNotify: useNotifySettingsStore.getState().openModal,
  openMemberProfile: openMemberProfileEditor,
  askNickname: useModerationStore.getState().askNickname,
  markRead: (id: string) => useChatStore.setState((state) => readServerPatch(state, id)),
  openInvite: useUIStore.getState().openServerInviteModal,
  openSettings: useServerSettingsStore.getState().openSettings,
  openCreateChannel: useChannelSidebarStore.getState().openCreate,
  toggleHideMuted: useHideMutedStore.getState().toggle
}

/**
 * As ações do menu sobre o servidor de `data`. Aberto ou não: o que só existe
 * na tela do servidor aberto (convite, configurações, criar canal, eventos)
 * abre o servidor e roda quando ele chega; o resto age direto no servidor do
 * menu, sem trocar a tela.
 */
export function useServerMenuActions(data: ServerMenuData | null): ServerMenuActions | null {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const openId = useServerStore((s) => s.currentServer?.id)
  const serverId = data?.server.id
  const isOpen = openId !== undefined && openId === serverId

  return useMemo(() => {
    if (!data) return null
    const id = data.server.id
    const deps: ServerMenuDeps = {
      ...STORE_DEPS,
      server: data.server,
      user: user ?? undefined,
      members: data.members,
      onServer: (run) => {
        if (isOpen) return run()
        useServerMenuStore.getState().setPending(id, run)
        navigate(`/servers/${id}`)
      },
      askConfirm: (kind) =>
        isOpen
          ? useChannelSidebarStore.getState().openConfirm(kind)
          : useServerMenuStore.getState().askConfirm(id, kind),
      askCategory: () => useServerMenuStore.getState().askCategory(id)
    }
    return buildServerMenuActions(deps)
  }, [data, user, isOpen, navigate])
}
