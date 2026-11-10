import { create } from 'zustand'
import { ApiError } from '../../../shared/api/client'
import { castCastigoVote, currentCastigoVote, listCastigos } from '../api/castigos'
import { mergeVote, type Castigo, type CastigoVote } from '../lib/castigo'

interface CastigoState {
  /** serverId -> userId -> castigo (o que o servidor mandou por último). */
  byServer: Record<string, Record<string, Castigo>>
  /** callId -> votação (aberta ou o resultado, até a próxima). */
  votes: Record<string, CastigoVote>
  load: (serverId: string) => Promise<void>
  loadVote: (callId: string) => Promise<void>
  /** castigo:update (prazos nulos = acabou). */
  upsert: (c: Castigo) => void
  /** castigo:vote. */
  setVote: (vote: CastigoVote) => void
  dropVote: (callId: string) => void
  /** Vota; votação que o servidor não tem mais sai da tela (e o erro segue). */
  cast: (vote: CastigoVote, yes: boolean) => Promise<void>
}

/** Os castigos do servidor aberto e as votações da call (um store só do castigo). */
export const useCastigoStore = create<CastigoState>((set, get) => ({
  byServer: {},
  votes: {},

  load: async (serverId) => {
    const list = await listCastigos(serverId)
    set((s) => ({
      byServer: { ...s.byServer, [serverId]: Object.fromEntries(list.map((c) => [c.user_id, c])) }
    }))
  },

  loadVote: async (callId) => {
    const vote = await currentCastigoVote(callId)
    if (vote) set((s) => ({ votes: { ...s.votes, [callId]: vote } }))
  },

  upsert: (c) =>
    set((s) => ({
      byServer: { ...s.byServer, [c.server_id]: { ...s.byServer[c.server_id], [c.user_id]: c } }
    })),

  setVote: (vote) =>
    set((s) => ({ votes: { ...s.votes, [vote.call_id]: mergeVote(s.votes[vote.call_id], vote) } })),

  dropVote: (callId) =>
    set((s) => {
      const votes = { ...s.votes }
      delete votes[callId]
      return { votes }
    }),

  cast: async (vote, yes) => {
    try {
      get().setVote(await castCastigoVote(vote.call_id, vote.id, yes))
    } catch (err) {
      if (err instanceof ApiError && err.code === 'vote_not_found') get().dropVote(vote.call_id)
      throw err
    }
  }
}))
