import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import { fetchBadges, type Badge, type BadgeStreak, type BadgeUnlockEvent } from '../api/badges'
import { sessionGuard } from '../../auth/lib/sessionGuard'
import { unlocksComAviso } from '../lib/badges'

/** Cartão aberto de novo depois disso busca os badges outra vez. */
const MAX_AGE_MS = 60_000
/** Quanto o aviso de badge novo fica na tela. */
export const UNLOCK_TOAST_MS = 5_000

export interface BadgesModalTarget {
  userId: string
  name: string
  avatarUrl?: string | null
  /** Badge selecionado ao abrir. */
  category?: string
}

export interface UnlockToast {
  key: number
  unlocks: BadgeUnlockEvent['unlocks']
}

interface BadgeState {
  byUser: Record<
    string,
    { badges: Badge[]; hiddenRemaining: number; streak?: BadgeStreak; loadedAt: number }
  >
  modal: BadgesModalTarget | null
  toast: UnlockToast | null
  /** Busca se ainda não tem (ou se está velho). */
  ensureBadges: (userId: string, force?: boolean) => Promise<void>
  openModal: (target: BadgesModalTarget) => void
  closeModal: () => void
  dismissToast: () => void
  handleWsEvent: (event: WsEvent) => void
  reset: () => void
}

const inflight = new Map<string, Promise<void>>()
let toastSeq = 0

export const useBadgeStore = create<BadgeState>()((set, get) => ({
  byUser: {},
  modal: null,
  toast: null,

  ensureBadges: (userId, force = false) => {
    if (!userId) return Promise.resolve()
    const cached = get().byUser[userId]
    if (!force && cached && Date.now() - cached.loadedAt < MAX_AGE_MS) return Promise.resolve()
    const running = inflight.get(userId)
    if (running && !force) return running
    const sameSession = sessionGuard()
    const job = fetchBadges(userId)
      .then((res) => {
        if (!sameSession()) return
        set((state) => ({
          byUser: {
            ...state.byUser,
            [userId]: {
              badges: res.badges,
              hiddenRemaining: res.hidden_remaining ?? 0,
              streak: res.streak,
              loadedAt: Date.now()
            }
          }
        }))
      })
      .catch((err) => console.error('[badgeStore] fetchBadges failed:', err))
      .finally(() => {
        if (inflight.get(userId) === job) inflight.delete(userId)
      })
    inflight.set(userId, job)
    return job
  },

  openModal: (target) => {
    set({ modal: target })
    void get().ensureBadges(target.userId)
  },
  closeModal: () => set({ modal: null }),

  dismissToast: () => set({ toast: null }),

  handleWsEvent: (event) => {
    if (event.type !== 'badge:unlock') return
    const payload = event.payload as BadgeUnlockEvent
    if (!payload?.unlocks?.length) return
    void get().ensureBadges(payload.user_id, true)
    const unlocks = unlocksComAviso(payload.unlocks)
    if (!unlocks.length) return
    const key = ++toastSeq
    set({ toast: { key, unlocks } })
    setTimeout(() => {
      if (get().toast?.key === key) set({ toast: null })
    }, UNLOCK_TOAST_MS)
  },

  reset: () => {
    inflight.clear()
    set({ byUser: {}, modal: null, toast: null })
  }
}))
