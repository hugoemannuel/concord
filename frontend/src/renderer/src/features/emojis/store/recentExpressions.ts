import { create } from 'zustand'
import { rankUses, recordUse, type UseMap } from '../lib/frecency'

// O que a pessoa mais usa, neste aparelho e por conta: emoji Unicode, emoji
// personalizado de qualquer servidor ("custom:<id>") e figurinha (o id).

export type RecentKind = 'emoji' | 'sticker'

interface RecentState {
  emoji: UseMap
  sticker: UseMap
  userId: string | null
  load: (userId: string | null | undefined) => void
  record: (kind: RecentKind, key: string) => void
}

const storageKey = (userId: string): string => `salinha:recent-expressions:${userId}`

function read(userId: string): Pick<RecentState, RecentKind> {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(userId)) ?? '{}')
    return { emoji: saved.emoji ?? {}, sticker: saved.sticker ?? {} }
  } catch {
    return { emoji: {}, sticker: {} }
  }
}

function write(state: RecentState): void {
  if (!state.userId) return
  try {
    localStorage.setItem(storageKey(state.userId), JSON.stringify({ emoji: state.emoji, sticker: state.sticker }))
  } catch {
    // Sem armazenamento (cota, modo privado): vale só nesta sessão.
  }
}

export const useRecentExpressions = create<RecentState>((set, get) => ({
  emoji: {},
  sticker: {},
  userId: null,

  load: (userId) => {
    const id = userId ?? null
    if (id === get().userId) return
    set({ userId: id, ...(id ? read(id) : { emoji: {}, sticker: {} }) })
  },

  record: (kind, key) => {
    set((s) => ({ [kind]: recordUse(s[kind], key, Date.now()) }))
    write(get())
  }
}))

export const rankedRecent = (map: UseMap): string[] => rankUses(map, Date.now())

/** Volta ao estado inicial (testes). */
export function resetRecentExpressions(): void {
  useRecentExpressions.setState({ emoji: {}, sticker: {}, userId: null })
}
