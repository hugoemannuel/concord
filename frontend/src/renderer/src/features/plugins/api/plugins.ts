import { request } from '../../../shared/api/client'

export type PluginStatus = 'pending' | 'approved' | 'rejected'

export interface Plugin {
  id: string
  name: string
  description: string
  panel_url: string
  author_username: string
  status: PluginStatus
}

/** Plugin instalado e aprovado num servidor; `enabled` é a escolha de quem está logado. */
export interface ServerPlugin extends Plugin {
  enabled: boolean
}

export function fetchCatalog(): Promise<Plugin[]> {
  return request<Plugin[]>('/plugins')
}

export function fetchServerPlugins(serverId: string): Promise<ServerPlugin[]> {
  return request<ServerPlugin[]>(`/servers/${serverId}/plugins`)
}

export async function installPlugin(serverId: string, pluginId: string): Promise<void> {
  await request<void>(`/servers/${serverId}/plugins/${pluginId}`, { method: 'PUT' })
}

export async function uninstallPlugin(serverId: string, pluginId: string): Promise<void> {
  await request<void>(`/servers/${serverId}/plugins/${pluginId}`, { method: 'DELETE' })
}

export async function setPluginEnabled(serverId: string, pluginId: string, enabled: boolean): Promise<void> {
  await request<void>(`/servers/${serverId}/plugins/${pluginId}/me`, {
    method: 'PUT',
    body: JSON.stringify({ enabled })
  })
}
