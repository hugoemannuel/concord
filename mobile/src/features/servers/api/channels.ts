import { request } from '../../../shared/api/client'

export type ChannelType = 'text' | 'voice'

export interface Channel {
  id: string
  server_id: string
  name: string
  type: ChannelType
  /** Ordem por tipo (texto ou voz), a dos apps antigos; a da barra vem da organização. */
  position?: number
  is_system?: boolean
  created_by: string
  created_at: string
  updated_at: string
}

export function listChannels(serverId: string): Promise<Channel[]> {
  return request<Channel[]>(`/servers/${serverId}/channels`)
}

export interface ChannelCategory {
  id: string
  name: string
  position: number
}

export interface ChannelPlacement {
  channel_id: string
  category_id: string | null
  position: number
}

/** A organização da barra, só com o que o membro pode ver (o servidor filtra). */
export interface ChannelLayout {
  categories: ChannelCategory[]
  channels: ChannelPlacement[]
}

export function getChannelLayout(serverId: string): Promise<ChannelLayout> {
  return request<ChannelLayout>(`/servers/${serverId}/categories`)
}
