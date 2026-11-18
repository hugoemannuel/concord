import type { PublicUser } from '../../auth/store/authStore'
import type { CallStateResponse } from '../../call/api/calls'
import { voicePeople, type VoiceMember } from '../../call/lib/voiceServer'

/** Amigos com presença conhecida e status diferente de offline (sem status = online). */
export function onlineFriends(
  friends: PublicUser[],
  presence: Record<string, unknown>,
  statuses: Record<string, string | undefined>
): PublicUser[] {
  return friends.filter((f) => presence[f.id] && (statuses[f.id] ?? 'online') !== 'offline')
}

export interface FriendInVoice {
  friend: PublicUser
  serverId: string
  channelId: string
  /** Todo mundo na call (não só amigos), para a pilha de avatares. */
  people: VoiceMember[]
}

/** Canal de cada usuário em call de servidor (o primeiro, se aparecer em dois). */
function callByUser(serverCalls: Record<string, CallStateResponse>): Map<string, CallStateResponse> {
  const byUser = new Map<string, CallStateResponse>()
  for (const entry of Object.values(serverCalls)) {
    if (!entry.call?.server_id || !entry.call.channel_id) continue
    for (const p of entry.participants ?? []) {
      if (!byUser.has(p.user_id)) byUser.set(p.user_id, entry)
    }
  }
  return byUser
}

/** Amigos em canais de voz de servidor, com onde estão e quem está com eles. */
export function friendsInVoice(
  friends: PublicUser[],
  serverCalls: Record<string, CallStateResponse>
): FriendInVoice[] {
  const byUser = callByUser(serverCalls)
  return friends.flatMap((friend) => {
    const entry = byUser.get(friend.id)
    if (!entry?.call?.server_id || !entry.call.channel_id) return []
    return [
      {
        friend,
        serverId: entry.call.server_id,
        channelId: entry.call.channel_id,
        people: voicePeople([entry])
      }
    ]
  })
}
