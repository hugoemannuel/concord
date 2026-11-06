import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import { fetchLevels, fetchMyLevel, type LevelProgress } from '../api/levels'
import { useAuthStore } from '../../auth/store/authStore'
import { sessionGuard } from '../../auth/lib/sessionGuard'
import { levelUpEffects, milestoneFor, nextMilestone } from '../lib/levels'
import {
  canReplay,
  isAttentive,
  queueLevelUp,
  readAttention,
  resolvePending,
  type PendingLevelUp
} from '../lib/levelAttention'

export interface Celebration {
  level: number
  previous: number
  /** Muda a cada subida, para reiniciar a animação. */
  key: number
}

/** Celebração de OUTRA pessoa tocando só na sua tela (clique no selo do cartão). */
export interface Showcase extends Celebration {
  userId: string
  name?: string
}

interface LevelState {
  /** Nível de cada usuário já carregado. */
  levels: Record<string, number>
  /** Progresso detalhado de quem está logado (barra de XP). */
  me: LevelProgress | null
  /** Quem está com a animação de subir de nível tocando agora. */
  celebrations: Record<string, Celebration>
  /** Celebração em tela cheia do nível de outra pessoa (só local). */
  showcase: Showcase | null
  ensureLevels: (userIds: string[]) => void
  loadMe: () => Promise<void>
  handleWsEvent: (event: WsEvent) => void
  /**
   * Só em dev: toca a animação de subir para `level` em você, sem subir de
   * verdade (o nível real volta quando ela acaba).
   */
  previewLevelUp: (level: number) => void
  /** Só em dev: prévia do próximo marco (10, 20…) depois do seu nível. */
  previewNextMilestone: () => void
  /**
   * Clique no selo de nível do cartão de perfil: toca a animação do nível de
   * `userId`. No seu cartão é a sua celebração completa; no de outra pessoa,
   * a celebração em tela cheia do nível dela, só na sua tela. Tem um
   * intervalo mínimo entre cliques.
   */
  replayLevelUp: (userId: string, name?: string) => void
  /** A janela voltou a ser vista: toca (ou descarta) a subida que ficou na fila. */
  flushPending: () => void
  reset: () => void
}

// Pedidos de nível juntados em um só request (vários badges montam juntos).
const requested = new Set<string>()
let queued = new Set<string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null
let celebrationSeq = 0
/** Sua subida que chegou com a janela fora de vista e espera a volta. */
let pendingMine: PendingLevelUp | null = null
let lastReplayAt: number | null = null
let showcaseTimer: ReturnType<typeof setTimeout> | null = null

/** Cena de marco tocando agora, por usuário (chave da celebração e quando acaba). */
const scenes = new Map<string, { key: number; endsAt: number }>()
/** Subida que chegou durante a cena de um marco e espera ela acabar. */
const waiting = new Map<
  string,
  { level: number; previous: number; timer: ReturnType<typeof setTimeout> }
>()

export const useLevelStore = create<LevelState>()((set, get) => {
  /**
   * Liga a animação de `userId`; ela some sozinha depois do tempo do nível.
   * Se a cena de um marco ainda está tocando, não corta: uma subida comum só
   * atualiza o selo (a cena e o jingle seguem) e outro marco entra na fila e
   * toca logo depois. Vários na fila viram um só, do nível mais alto.
   * A SUA celebração (tela cheia, marco e jingle) não toca com a janela fora
   * de vista: fica na fila e toca quando você volta (flushPending). O que os
   * outros veem no seu avatar e no seu tile não depende disso. `force` pula
   * essa espera (prévia de dev, clique no selo).
   */
  const celebrate = (userId: string, level: number, previous: number, force = false): void => {
    const now = Date.now()
    if (!force && userId === useAuthStore.getState().user?.id && !isAttentive(readAttention())) {
      pendingMine = queueLevelUp(pendingMine, { level, previous }, now)
      set((state) => ({ levels: { ...state.levels, [userId]: level } }))
      return
    }
    const scene = scenes.get(userId)
    const playing =
      scene !== undefined && scene.endsAt > now && get().celebrations[userId]?.key === scene.key
    if (playing) {
      set((state) => ({ levels: { ...state.levels, [userId]: level } }))
      const wait = waiting.get(userId)
      if (wait) {
        wait.level = Math.max(wait.level, level)
        wait.previous = Math.min(wait.previous, previous)
        return
      }
      if (!milestoneFor(level, previous)) return
      const timer = setTimeout(() => {
        const next = waiting.get(userId)
        waiting.delete(userId)
        if (next) celebrate(userId, next.level, next.previous)
      }, scene.endsAt - now)
      waiting.set(userId, { level, previous, timer })
      return
    }

    const key = ++celebrationSeq
    const milestone = milestoneFor(level, previous)
    if (milestone) scenes.set(userId, { key, endsAt: now + milestone.durationMs })
    else scenes.delete(userId)
    set((state) => ({
      levels: { ...state.levels, [userId]: level },
      celebrations: { ...state.celebrations, [userId]: { level, previous, key } }
    }))
    setTimeout(() => {
      set((state) => {
        if (state.celebrations[userId]?.key !== key) return {}
        const celebrations = { ...state.celebrations }
        delete celebrations[userId]
        return { celebrations }
      })
    }, levelUpEffects(level, previous).durationMs)
  }

  return {
    levels: {},
    me: null,
    celebrations: {},
    showcase: null,

    ensureLevels: (userIds) => {
      for (const id of userIds) {
        if (id && !requested.has(id)) {
          requested.add(id)
          queued.add(id)
        }
      }
      if (queued.size === 0 || flushTimer) return
      flushTimer = setTimeout(async () => {
        flushTimer = null
        const ids = Array.from(queued)
        queued = new Set()
        const sameSession = sessionGuard()
        try {
          const map = await fetchLevels(ids)
          if (!sameSession()) return
          set((state) => {
            const levels = { ...state.levels }
            for (const [id, progress] of Object.entries(map)) levels[id] = progress.level
            return { levels }
          })
        } catch (err) {
          ids.forEach((id) => requested.delete(id))
          console.error('[levelStore] fetchLevels failed:', err)
        }
      }, 50)
    },

    loadMe: async () => {
      try {
        const me = await fetchMyLevel()
        set((state) => ({ me, levels: { ...state.levels, [me.user_id]: me.level } }))
      } catch (err) {
        console.error('[levelStore] fetchMyLevel failed:', err)
      }
    },

    handleWsEvent: (event) => {
      if (event.type === 'level:update') {
        const me = event.payload as LevelProgress
        set((state) => ({ me, levels: { ...state.levels, [me.user_id]: me.level } }))
        return
      }

      if (event.type === 'level:up') {
        const payload = event.payload as { user_id: string; level: number; previous_level: number }
        // O mesmo evento chega pela sala da chamada, do servidor e do usuário.
        if (get().celebrations[payload.user_id]?.level === payload.level) return
        celebrate(payload.user_id, payload.level, payload.previous_level)
      }
    },

    previewLevelUp: (level) => {
      const meId = useAuthStore.getState().user?.id
      if (!meId || !Number.isFinite(level) || level < 1) return
      const target = Math.floor(level)
      // Nível de verdade (o do levelStore.me é o mais confiável).
      const real = get().me?.level ?? get().levels[meId]
      celebrate(meId, target, target - 1, true)
      setTimeout(
        () => {
          set((state) => {
            // Outra prévia (ou uma subida de verdade) começou nesse meio-tempo.
            if (state.celebrations[meId] || state.levels[meId] !== target) return {}
            const levels = { ...state.levels }
            if (real === undefined) delete levels[meId]
            else levels[meId] = real
            return { levels }
          })
        },
        levelUpEffects(target).durationMs + 50
      )
    },

    previewNextMilestone: () => {
      const meId = useAuthStore.getState().user?.id
      if (!meId) return
      const real = get().me?.level ?? get().levels[meId] ?? 0
      get().previewLevelUp(nextMilestone(real))
    },

    replayLevelUp: (userId, name) => {
      const level = get().levels[userId]
      if (level === undefined || !Number.isFinite(level)) return
      const now = Date.now()
      if (!canReplay(lastReplayAt, now)) return
      lastReplayAt = now
      if (userId === useAuthStore.getState().user?.id) {
        celebrate(userId, level, level - 1, true)
        return
      }
      const key = ++celebrationSeq
      if (showcaseTimer) clearTimeout(showcaseTimer)
      set({ showcase: { userId, name, level, previous: level - 1, key } })
      showcaseTimer = setTimeout(
        () => {
          showcaseTimer = null
          set((state) => (state.showcase?.key === key ? { showcase: null } : {}))
        },
        levelUpEffects(level, level - 1).durationMs
      )
    },

    flushPending: () => {
      const meId = useAuthStore.getState().user?.id
      const action = resolvePending(pendingMine, readAttention(), Date.now())
      if (action === 'wait' || !pendingMine) return
      const { level, previous } = pendingMine
      pendingMine = null
      if (action === 'play' && meId) celebrate(meId, level, previous, true)
    },

    reset: () => {
      pendingMine = null
      lastReplayAt = null
      if (showcaseTimer) clearTimeout(showcaseTimer)
      showcaseTimer = null
      for (const wait of waiting.values()) clearTimeout(wait.timer)
      waiting.clear()
      scenes.clear()
      requested.clear()
      queued = new Set()
      set({ levels: {}, me: null, celebrations: {}, showcase: null })
    }
  }
})
