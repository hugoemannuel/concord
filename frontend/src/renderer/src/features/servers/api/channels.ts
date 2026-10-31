import { request } from '../../../shared/api/client'
import type { ChannelOverwrite, OverwriteTarget } from '../lib/permissions'

export type ChannelType = 'text' | 'voice'

export interface Channel {
  id: string
  server_id: string
  name: string
  type: ChannelType
  /** Ordem dentro da seção (texto ou voz); a lista já vem ordenada. */
  position?: number
  /** Canal do Maestro ("musica"): não pode ser editado nem removido, só movido. */
  is_system?: boolean
  /** Canal da sala de um evento: só o evento o cria e apaga. */
  managed?: boolean
  created_by: string
  created_at: string
  updated_at: string
  /** Sobrescritas de permissão do canal (privado = @everyone sem VIEW_CHANNEL). */
  overwrites?: ChannelOverwrite[]
}

/**
 * Pedidos da lista disparados no mesmo tick (o mesmo evento chama
 * serverStore.fetchChannels e chatStore.fetchChannelsForServers) viram um só.
 * Só junta no mesmo tick: um pedido mais antigo ainda no ar pode ter saído
 * antes da mudança que o evento avisa.
 */
const sameTick = new Map<string, Promise<Channel[]>>()

export function listChannels(serverId: string): Promise<Channel[]> {
  const pending = sameTick.get(serverId)
  if (pending) return pending
  const promise = request<Channel[]>(`/servers/${serverId}/channels`)
  sameTick.set(serverId, promise)
  queueMicrotask(() => sameTick.delete(serverId))
  return promise
}

export interface CreateChannelOptions {
  /** Canal privado: só os cargos de roleIds (e quem criou) veem. */
  private?: boolean
  roleIds?: string[]
}

export function createChannel(
  serverId: string,
  name: string,
  type: ChannelType = 'text',
  options: CreateChannelOptions = {}
): Promise<Channel> {
  return request<Channel>(`/servers/${serverId}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      type,
      ...(options.private ? { private: true, role_ids: options.roleIds ?? [] } : {})
    })
  })
}

/** Libera/nega permissões no canal para um cargo ou membro (MANAGE_ROLES no canal). */
export function setChannelOverwrite(
  serverId: string,
  channelId: string,
  targetType: OverwriteTarget,
  targetId: string,
  allow: number,
  deny: number
): Promise<ChannelOverwrite> {
  return request<ChannelOverwrite>(
    `/servers/${serverId}/channels/${channelId}/overwrites/${targetType}/${targetId}`,
    { method: 'PUT', body: JSON.stringify({ allow, deny }) }
  )
}

/** Volta o cargo/membro a herdar tudo do servidor neste canal. */
export function deleteChannelOverwrite(
  serverId: string,
  channelId: string,
  targetType: OverwriteTarget,
  targetId: string
): Promise<void> {
  return request<void>(
    `/servers/${serverId}/channels/${channelId}/overwrites/${targetType}/${targetId}`,
    { method: 'DELETE' }
  )
}

export function updateChannel(serverId: string, channelId: string, name: string): Promise<Channel> {
  return request<Channel>(`/servers/${serverId}/channels/${channelId}`, {
    method: 'PUT',
    body: JSON.stringify({ name })
  })
}

export function deleteChannel(serverId: string, channelId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/channels/${channelId}`, {
    method: 'DELETE'
  })
}

/**
 * Nova ordem dos canais de um tipo (dono/moderadores). `requestId` volta no
 * evento channel:reorder do WS, para quem pediu reconhecer o próprio eco.
 */
export function reorderChannels(
  serverId: string,
  type: ChannelType,
  channelIds: string[],
  requestId?: string
): Promise<{ type: ChannelType; channel_ids: string[] }> {
  return request(`/servers/${serverId}/channels/order`, {
    method: 'PUT',
    body: JSON.stringify({ type, channel_ids: channelIds, request_id: requestId })
  })
}
