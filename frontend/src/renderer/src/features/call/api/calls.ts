import { request } from '../../../shared/api/client'
import type { RawCallActivity } from '../../activity/lib/activityState'
import type { NameStyle } from '../../profile/lib/nameStyle'

export type CallType = 'dm' | 'channel'
export type CallStatus = 'ringing' | 'active' | 'ended'

export interface CallInfo {
  id: string
  type: CallType
  conversation_id?: string | null
  channel_id?: string | null
  server_id?: string | null
  initiator_id: string
  status: CallStatus
  started_at: string
  ended_at?: string | null
  /** sala de voz trancada: entrar exige aprovação de quem está dentro */
  locked?: boolean
}

export interface CallParticipant {
  call_id: string
  user_id: string
  role: 'member' | 'presenter'
  joined_at: string
  muted?: boolean
  deafened?: boolean
  /** Impostos por um moderador (silenciar/ensurdecer no servidor). */
  server_muted?: boolean
  server_deafened?: boolean
  id?: string
  username?: string
  display_name?: string
  avatar_url?: string | null
  avatar_decoration_url?: string | null
  nameplate_url?: string | null
  name_style?: NameStyle
  /** Servidor de que a pessoa é visitante (selo "Visitante"; ausente = não é). */
  guest_of?: string
}

export interface CallStateResponse {
  call: CallInfo | null
  participants: CallParticipant[]
  /** user_ids compartilhando tela neste momento (transitório) */
  screen_sharing?: string[]
  /** Atividade aberta na chamada (só vem para quem está nela). */
  activity?: RawCallActivity | null
  /** Lista de quem assiste cada tela (sharer_id -> espectadores) */
  screen_watchers?: Record<
    string,
    {
      id: string
      username: string
      display_name: string
      avatar_url?: string | null
      avatar_decoration_url?: string | null
      nameplate_url?: string | null
    }[]
  >
  /** pedidos para entrar na sala trancada (só no estado visto por participantes) */
  join_requests?: {
    id: string
    username: string
    display_name: string
    avatar_url?: string | null
    avatar_decoration_url?: string | null
    nameplate_url?: string | null
  }[]
}

export interface StartCallInput {
  type: CallType
  conversation_id?: string
  channel_id?: string
}

export function startCall(input: StartCallInput): Promise<CallInfo> {
  return request<CallInfo>('/calls', { method: 'POST', body: JSON.stringify(input) })
}

export function endCall(callId: string): Promise<{ message: string }> {
  return request<{ message: string }>(`/calls/${callId}`, { method: 'DELETE' })
}

export function getCallState(callId: string): Promise<CallStateResponse> {
  return request<CallStateResponse>(`/calls/${callId}/state`)
}

export function listActiveServerCalls(serverId: string): Promise<CallStateResponse[]> {
  return request<CallStateResponse[]>(
    `/calls/active?scope=server&id=${encodeURIComponent(serverId)}`
  )
}

/** Atende a DM que está tocando; resolve depois de o servidor registrar a entrada. */
export function acceptCall(callId: string): Promise<void> {
  return request<void>(`/calls/${callId}/accept`, { method: 'POST' })
}

/** Token do LiveKit para entrar na sala de mídia da chamada (só participantes). */
export function getCallToken(callId: string): Promise<{ token: string }> {
  return request<{ token: string }>(`/calls/${callId}/token`, { method: 'POST' })
}

/** Token do participante "tela" (live pelo motor nativo, docs/adr/0031): só publica a tela. */
export function getScreenToken(callId: string): Promise<{ token: string; identity: string }> {
  return request<{ token: string; identity: string }>(`/calls/${callId}/screen-token`, {
    method: 'POST'
  })
}

/** Moderadores: tira alguém do canal de voz em que está e o põe em outro. */
export function moveToVoiceChannel(userId: string, channelId: string): Promise<CallInfo> {
  return request<CallInfo>('/calls/move', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId, channel_id: channelId })
  })
}

/** Silencia (ou libera) alguém no servidor: ele não consegue falar até liberarem. */
export function setServerMute(callId: string, userId: string, muted: boolean): Promise<void> {
  return request<void>(`/calls/${callId}/participants/${userId}/server-mute`, {
    method: 'POST',
    body: JSON.stringify({ muted })
  })
}

/** Ensurdece (ou libera) alguém no servidor: ele não ouve ninguém. */
export function setServerDeafen(callId: string, userId: string, deafened: boolean): Promise<void> {
  return request<void>(`/calls/${callId}/participants/${userId}/server-deafen`, {
    method: 'POST',
    body: JSON.stringify({ deafened })
  })
}

/** Tira alguém da chamada (MOVE_MEMBERS). */
export function disconnectParticipant(callId: string, userId: string): Promise<void> {
  return request<void>(`/calls/${callId}/participants/${userId}`, { method: 'DELETE' })
}

/** Miniatura da transmissão (base64 do JPEG); image null = pedida, ainda não chegou. */
export function getScreenPreview(
  callId: string,
  userId: string
): Promise<{ image: string | null }> {
  return request<{ image: string | null }>(
    `/calls/${encodeURIComponent(callId)}/screen-preview/${encodeURIComponent(userId)}`
  )
}

/** Quem transmite manda a miniatura pedida pelo servidor (base64 do JPEG). */
export function putScreenPreview(callId: string, image: string): Promise<void> {
  return request<void>(`/calls/${encodeURIComponent(callId)}/screen-preview`, {
    method: 'PUT',
    body: JSON.stringify({ image })
  })
}
