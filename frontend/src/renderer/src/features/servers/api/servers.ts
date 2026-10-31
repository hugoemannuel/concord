import { request } from '../../../shared/api/client'
import { uploadImage } from '../../profile/api/users'
import type { Role } from '../lib/permissions'
import type { NameStyle } from '../../profile/lib/nameStyle'

export interface Server {
  id: string
  name: string
  icon_url?: string
  owner_id: string
  /** Canal de texto dos avisos do servidor (ver lib/primaryChannel). */
  primary_channel_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface ServerMember {
  server_id: string
  user_id: string
  /** Legado: "admin" se pode gerenciar canais. Os cargos de verdade estão em role_ids. */
  role: string
  /** Cargos do membro (sem o @everyone). */
  role_ids?: string[]
  joined_at?: string
  username?: string
  display_name?: string
  avatar_url?: string | null
  name_style?: NameStyle
  /** Faixa efetiva (o banner ou a imagem própria; ausente = sem faixa). */
  nameplate_url?: string | null
  /** Moldura do avatar (ausente = sem moldura). */
  avatar_decoration_url?: string | null
  is_bot?: boolean
  /** Apelido neste servidor (null = sem; vale o display_name). */
  nickname?: string | null
}

export interface GetServerResponse {
  server: Server
  members: ServerMember[]
  /** Cargos do servidor, do mais alto para o mais baixo (o @everyone por último). */
  roles?: Role[]
}

export interface CreateServerInput {
  name: string
  icon_url?: string
}

export async function createServer(input: CreateServerInput): Promise<Server> {
  return request<Server>('/servers', {
    method: 'POST',
    body: JSON.stringify(input)
  })
}

export async function listServers(): Promise<Server[]> {
  return request<Server[]>('/servers')
}

export async function getServer(id: string): Promise<GetServerResponse> {
  return request<GetServerResponse>(`/servers/${id}`)
}

export async function inviteMember(serverId: string, userId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/invite`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId })
  })
}

/** Só o nome: sem icon_url o backend mantém o ícone atual. */
export async function updateServer(serverId: string, input: { name: string }): Promise<Server> {
  return request<Server>(`/servers/${serverId}`, {
    method: 'PUT',
    body: JSON.stringify(input)
  })
}

export async function deleteServer(serverId: string): Promise<void> {
  return request<void>(`/servers/${serverId}`, {
    method: 'DELETE'
  })
}

/** Código de convite do servidor (qualquer membro pode ver e compartilhar). */
export async function getInviteCode(serverId: string): Promise<{ code: string }> {
  return request<{ code: string }>(`/servers/${serverId}/invite-code`)
}

/** "Gerar novo link": troca o código (o link antigo para de funcionar). */
export async function rotateInviteCode(serverId: string): Promise<{ code: string }> {
  return request<{ code: string }>(`/servers/${serverId}/invite-code/reset`, { method: 'POST' })
}

/** Entra no servidor do código. Já sendo membro, só devolve o servidor. */
export async function joinServerByCode(code: string): Promise<Server> {
  return request<Server>('/invites/join', { method: 'POST', body: JSON.stringify({ code }) })
}

/** Quem tem KICK_MEMBERS expulsa o membro (ele pode voltar por convite). */
export function kickMember(serverId: string, userId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/members/${userId}`, { method: 'DELETE' })
}

export interface NicknameResult {
  server_id: string
  user_id: string
  nickname: string | null
}

/**
 * Muda o apelido de alguém no servidor ("" tira). O próprio pede "Alterar
 * apelido"; o dos outros, "Gerenciar apelidos" e cargo acima do dela.
 */
export function setMemberNickname(
  serverId: string,
  userId: string,
  nickname: string
): Promise<NicknameResult> {
  return request<NicknameResult>(`/servers/${serverId}/members/${userId}/nickname`, {
    method: 'PUT',
    body: JSON.stringify({ nickname })
  })
}

/** Sai do servidor (o dono não sai: apaga o servidor). */
export function leaveServer(serverId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/leave`, { method: 'POST' })
}

export interface ServerBan {
  server_id: string
  user_id: string
  username: string
  display_name: string
  avatar_url?: string | null
  banned_by?: string | null
  reason?: string | null
  created_at: string
}

export function listBans(serverId: string): Promise<ServerBan[]> {
  return request<ServerBan[]>(`/servers/${serverId}/bans`)
}

/** Bane o membro (vale também para quem já saiu). */
export function banMember(serverId: string, userId: string, reason?: string): Promise<void> {
  return request<void>(`/servers/${serverId}/bans`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, reason: reason ?? '' })
  })
}

export function unbanMember(serverId: string, userId: string): Promise<void> {
  return request<void>(`/servers/${serverId}/bans/${userId}`, { method: 'DELETE' })
}

/** Dono/moderador: escolhe o canal principal (avisos do servidor). */
export async function setPrimaryChannel(serverId: string, channelId: string): Promise<Server> {
  return request<Server>(`/servers/${serverId}/primary-channel`, {
    method: 'PUT',
    body: JSON.stringify({ channel_id: channelId })
  })
}

/** Ícone por upload (PNG, JPG, WebP ou GIF): o mesmo pipeline do avatar. */
export function uploadServerIcon(
  serverId: string,
  file: Blob,
  staticFrame?: Blob,
  onProgress?: (fraction: number) => void
): Promise<Server> {
  return uploadImage<Server>(`/servers/${serverId}/icon`, 'icon', file, staticFrame, onProgress)
}

export async function removeServerIcon(serverId: string): Promise<Server> {
  return request<Server>(`/servers/${serverId}/icon`, { method: 'DELETE' })
}
