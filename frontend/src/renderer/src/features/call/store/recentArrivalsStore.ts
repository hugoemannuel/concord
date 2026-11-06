import { create } from 'zustand'
import {
  EMPTY_ARRIVALS,
  ingestSnapshot,
  nextExpiry,
  pruneExpired,
  recordJoin,
  recordLeave,
  resetBaseline,
  type ArrivalState,
  type VoiceMembers
} from '../lib/recentArrivals'

// Selos "Chegou" ativos (canal -> usuário -> quando vencem). Fica fora do
// callStore de propósito; a regra de quem conta como chegada está em
// lib/recentArrivals.

interface RecentArrivalsStore extends ArrivalState {
  /** Lista dos canais de voz do servidor aberto (lida ao abrir o servidor). */
  ingest: (serverId: string, members: VoiceMembers, meId: string | undefined) => void
  /** call:joined na minha call ou call:channel_joined em qualquer canal. */
  join: (channelId: string, userId: string, meId: string | undefined) => void
  /** call:left na minha call ou call:channel_left em qualquer canal. */
  leave: (channelId: string, userId: string) => void
  /** O WebSocket reconectou: a próxima lista é só base. */
  resetBaseline: () => void
  reset: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null

function clearTimer(): void {
  if (timer) clearTimeout(timer)
  timer = null
}

export const useRecentArrivalsStore = create<RecentArrivalsStore>()((set, get) => {
  const apply = (update: (s: ArrivalState, now: number) => ArrivalState): void => {
    const { arrivals, departures, snapshot } = get()
    set(update({ arrivals, departures, snapshot }, Date.now()))
    // O selo some sozinho: um timer só, para o próximo vencimento.
    clearTimer()
    const at = nextExpiry(get().arrivals)
    if (at === null) return
    timer = setTimeout(() => apply(pruneExpired), Math.max(0, at - Date.now()))
  }
  return {
    ...EMPTY_ARRIVALS,
    ingest: (serverId, members, meId) =>
      apply((s, now) => ingestSnapshot(s, serverId, members, meId, now)),
    join: (channelId, userId, meId) => apply((s, now) => recordJoin(s, channelId, userId, meId, now)),
    leave: (channelId, userId) => apply((s, now) => recordLeave(s, channelId, userId, now)),
    resetBaseline: () => apply(resetBaseline),
    reset: () => {
      clearTimer()
      set(EMPTY_ARRIVALS)
    }
  }
})
