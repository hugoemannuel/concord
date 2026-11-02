import { create } from 'zustand'
import {
  fetchCatalog,
  fetchServerPlugins,
  installPlugin,
  setPluginEnabled,
  uninstallPlugin,
  type Plugin,
  type ServerPlugin
} from '../api/plugins'

interface PluginsState {
  byServer: Record<string, ServerPlugin[]>
  catalog: Plugin[] | null
  load: (serverId: string) => Promise<void>
  loadCatalog: () => Promise<void>
  toggle: (serverId: string, pluginId: string, enabled: boolean) => Promise<void>
  install: (serverId: string, pluginId: string) => Promise<void>
  uninstall: (serverId: string, pluginId: string) => Promise<void>
}

export const usePluginsStore = create<PluginsState>((set, get) => {
  const setEnabled = (serverId: string, pluginId: string, enabled: boolean): void =>
    set((s) => ({
      byServer: {
        ...s.byServer,
        [serverId]: (s.byServer[serverId] ?? []).map((p) => (p.id === pluginId ? { ...p, enabled } : p))
      }
    }))

  return {
    byServer: {},
    catalog: null,
    async load(serverId) {
      const list = await fetchServerPlugins(serverId)
      set((s) => ({ byServer: { ...s.byServer, [serverId]: list } }))
    },
    async loadCatalog() {
      set({ catalog: await fetchCatalog() })
    },
    async toggle(serverId, pluginId, enabled) {
      setEnabled(serverId, pluginId, enabled)
      try {
        await setPluginEnabled(serverId, pluginId, enabled)
      } catch (err) {
        // Não restaura um valor capturado (dois toggles seguidos se atropelariam): relê do servidor.
        await get().load(serverId).catch(() => undefined)
        throw err
      }
    },
    async install(serverId, pluginId) {
      await installPlugin(serverId, pluginId)
      await get().load(serverId)
    },
    async uninstall(serverId, pluginId) {
      await uninstallPlugin(serverId, pluginId)
      await get().load(serverId)
    }
  }
})
