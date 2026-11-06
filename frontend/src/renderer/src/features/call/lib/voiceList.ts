import type { CallInfo, CallParticipant, CallStateResponse } from '../api/calls'
import { voicePeople, type VoiceMember } from './voiceServer'

// Lista dos canais de voz (quem está em cada um), de todos os servidores
// abertos no app: canal -> estado da chamada. Lida uma vez (abrir o servidor,
// reconectar) e mantida pelos eventos call:channel_* da sala do servidor.

export type ServerCalls = Record<string, CallStateResponse>

export interface ChannelJoinedPayload {
  call: CallInfo
  participant: CallParticipant
}

export interface ChannelLeftPayload {
  call_id: string
  channel_id: string
  user_id: string
}

export interface ChannelEndedPayload {
  call_id: string
  channel_id: string
}

/** Chamadas ativas do servidor indexadas pelo canal de voz (sem canal fica de fora). */
export function callsByChannel(states: CallStateResponse[]): ServerCalls {
  const map: ServerCalls = {}
  for (const st of states) {
    if (st.call?.channel_id) map[st.call.channel_id] = st
  }
  return map
}

/** Alguém entrou: linha nova (ou trocada, se a chamada do canal mudou) ou mais um na lista. */
export function applyChannelJoined(map: ServerCalls, p: ChannelJoinedPayload): ServerCalls {
  const channelId = p.call.channel_id
  if (!channelId) return map
  const entry = map[channelId]
  if (!entry || entry.call?.id !== p.call.id) {
    return { ...map, [channelId]: { call: p.call, participants: [p.participant], screen_sharing: [] } }
  }
  const others = entry.participants.filter((q) => q.user_id !== p.participant.user_id)
  return { ...map, [channelId]: { ...entry, participants: [...others, p.participant] } }
}

/** Alguém saiu: some da lista e do selo LIVE; o último leva a linha junto. */
export function applyChannelLeft(map: ServerCalls, p: ChannelLeftPayload): ServerCalls {
  const entry = map[p.channel_id]
  if (entry?.call?.id !== p.call_id) return map
  const participants = entry.participants.filter((q) => q.user_id !== p.user_id)
  if (participants.length === 0) return withoutChannel(map, p.channel_id)
  const screen_sharing = (entry.screen_sharing ?? []).filter((id) => id !== p.user_id)
  return { ...map, [p.channel_id]: { ...entry, participants, screen_sharing } }
}

/** A chamada do canal acabou. */
export function applyChannelEnded(map: ServerCalls, p: ChannelEndedPayload): ServerCalls {
  if (map[p.channel_id]?.call?.id !== p.call_id) return map
  return withoutChannel(map, p.channel_id)
}

function withoutChannel(map: ServerCalls, channelId: string): ServerCalls {
  const { [channelId]: _gone, ...rest } = map
  return rest
}

/** A lista lida de um servidor substitui só as chamadas dele. */
export function replaceServerCalls(map: ServerCalls, serverId: string, fresh: ServerCalls): ServerCalls {
  const kept = Object.entries(map).filter(([, entry]) => entry.call?.server_id !== serverId)
  return { ...Object.fromEntries(kept), ...fresh }
}

/** Quem está em voz em cada servidor pedido; só entram os servidores com gente. */
export function voiceActivityByServer(
  map: ServerCalls,
  serverIds: string[]
): Map<string, VoiceMember[]> {
  const byServer = new Map<string, CallStateResponse[]>()
  for (const entry of Object.values(map)) {
    const serverId = entry.call?.server_id
    if (serverId) byServer.set(serverId, [...(byServer.get(serverId) ?? []), entry])
  }
  const activity = new Map<string, VoiceMember[]>()
  for (const id of serverIds) {
    const people = voicePeople(byServer.get(id) ?? [])
    if (people.length > 0) activity.set(id, people)
  }
  return activity
}
