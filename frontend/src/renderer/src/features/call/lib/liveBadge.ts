import type { CallStateResponse } from '../api/calls'

// Selo LIVE na lista do canal de voz: quem está transmitindo, atualizado na
// hora pelo evento call:live.

export interface LivePayload {
  call_id: string
  user_id: string
  active: boolean
}

/** Atualiza `screen_sharing` da entrada da chamada do evento; chamada desconhecida → mesmo mapa. */
export function applyLiveEvent(
  serverCalls: Record<string, CallStateResponse>,
  p: LivePayload
): Record<string, CallStateResponse> {
  const channelId = Object.keys(serverCalls).find((id) => serverCalls[id].call?.id === p.call_id)
  if (!channelId) return serverCalls
  const entry = serverCalls[channelId]
  const others = (entry.screen_sharing ?? []).filter((id) => id !== p.user_id)
  return {
    ...serverCalls,
    [channelId]: { ...entry, screen_sharing: p.active ? [...others, p.user_id] : others }
  }
}

/** Quem mostra o selo: o que o servidor diz ∪ quem transmite na minha chamada (nesse canal). */
export function liveUserIds(
  entry: CallStateResponse | undefined,
  localSharers: string[]
): Set<string> {
  return new Set([...(entry?.screen_sharing ?? []), ...localSharers])
}

/** call:live recebido há pouco (ver reapplyRecentLive). */
export interface LiveRecord {
  payload: LivePayload
  at: number
}

/** Quanto tempo um call:live vale por cima da lista lida (uma ida e volta folgada). */
export const LIVE_GRACE_MS = 5000

/**
 * Reaplica sobre a lista lida do servidor os call:live recentes, na ordem: uma
 * leitura que saiu antes do evento e voltou depois traria o selo velho.
 */
export function reapplyRecentLive(
  serverCalls: Record<string, CallStateResponse>,
  recent: LiveRecord[],
  now: number
): Record<string, CallStateResponse> {
  return recent
    .filter((r) => now - r.at < LIVE_GRACE_MS)
    .reduce((map, r) => applyLiveEvent(map, r.payload), serverCalls)
}
