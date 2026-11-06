import { create } from 'zustand'
import {
  getNotifySettings,
  setChannelNotifySettings,
  setServerNotifySettings
} from '../api/notificationSettings'
import type { WsEvent } from '../../../shared/api/ws'
import {
  DEFAULT_NOTIFY_SETTINGS,
  resolveScope,
  type NotifySettings,
  type ResolvedScope
} from '../lib/notificationMute'
import { sessionGuard } from '../../auth/lib/sessionGuard'

/** Alvo do modal de notificações (servidor inteiro ou um canal). */
export interface NotifyModalTarget {
  serverId: string
  channelId?: string
  /** Nome mostrado no título. */
  name: string
}

interface NotifySettingsState {
  modal: NotifyModalTarget | null
  openModal: (target: NotifyModalTarget) => void
  closeModal: () => void
  servers: Record<string, NotifySettings>
  channels: Record<string, NotifySettings>
  fetchSettings: () => Promise<void>
  /** Grava (o servidor responde com a versão normalizada). */
  saveServer: (serverId: string, settings: NotifySettings) => Promise<void>
  saveChannel: (serverId: string, channelId: string, settings: NotifySettings) => Promise<void>
  /** Servidor e canal juntos, já com os prazos conferidos agora. */
  resolve: (serverId: string | null, channelId: string | null) => ResolvedScope
  handleWsEvent: (event: WsEvent) => void
  reset: () => void
}

/** Padrão não ocupa linha: some do mapa em vez de guardar "tudo, sem mute". */
function withEntry(
  map: Record<string, NotifySettings>,
  id: string,
  settings: NotifySettings
): Record<string, NotifySettings> {
  const next = { ...map }
  if (settings.muted || settings.level !== 'all' || settings.suppress_everyone) next[id] = settings
  else delete next[id]
  return next
}

export const useNotifySettingsStore = create<NotifySettingsState>()((set, get) => ({
  modal: null,
  openModal: (target) => set({ modal: target }),
  closeModal: () => set({ modal: null }),
  servers: {},
  channels: {},

  fetchSettings: async () => {
    const sameSession = sessionGuard()
    try {
      const all = await getNotifySettings()
      if (!sameSession()) return
      set({ servers: all.servers ?? {}, channels: all.channels ?? {} })
    } catch (err) {
      console.error('[notifySettingsStore] fetchSettings error:', err)
    }
  },

  saveServer: async (serverId, settings) => {
    const saved = await setServerNotifySettings(serverId, settings)
    set((s) => ({ servers: withEntry(s.servers, serverId, saved) }))
  },

  saveChannel: async (serverId, channelId, settings) => {
    const saved = await setChannelNotifySettings(serverId, channelId, settings)
    set((s) => ({ channels: withEntry(s.channels, channelId, saved) }))
  },

  resolve: (serverId, channelId) => {
    const { servers, channels } = get()
    return resolveScope(
      serverId ? servers[serverId] : undefined,
      channelId ? channels[channelId] : undefined,
      Date.now()
    )
  },

  handleWsEvent: (event) => {
    if (event.type !== 'notification-settings:update') return
    const p = event.payload as {
      scope?: 'server' | 'channel'
      id?: string
      settings?: NotifySettings
    }
    if (!p?.id || !p.settings) return
    const settings = { ...DEFAULT_NOTIFY_SETTINGS, ...p.settings }
    if (p.scope === 'server') set((s) => ({ servers: withEntry(s.servers, p.id!, settings) }))
    else if (p.scope === 'channel')
      set((s) => ({ channels: withEntry(s.channels, p.id!, settings) }))
  },

  reset: () => set({ servers: {}, channels: {}, modal: null })
}))
