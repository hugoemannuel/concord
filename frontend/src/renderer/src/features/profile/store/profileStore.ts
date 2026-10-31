import { create } from 'zustand'
import { getProfile, type PublicProfile } from '../api/users'
import { mergeProfile } from '../lib/profileRelationship'

// Perfis públicos já vistos (cartão de perfil) e a versão mais nova de cada
// pessoa que chegou por "user:update". Avatar e nome em mensagens, listas e
// calls leem daqui primeiro: trocar a foto atualiza tudo sem recarregar.

/** Depois disso o cartão busca o perfil de novo ao abrir. */
export const PROFILE_TTL_MS = 60_000

interface ProfileState {
  profiles: Record<string, PublicProfile>
  fetchedAt: Record<string, number>
  /** Busca o perfil (um pedido só por pessoa ao mesmo tempo). */
  fetchProfile: (userId: string, opts?: { force?: boolean }) => Promise<PublicProfile | null>
  /** Guarda o perfil novo (evento user:update ou resposta da API). */
  apply: (profile: PublicProfile) => void
  reset: () => void
}

const inflight = new Map<string, Promise<PublicProfile | null>>()

export const useProfileStore = create<ProfileState>()((set, get) => ({
  profiles: {},
  fetchedAt: {},

  fetchProfile: (userId, { force = false } = {}) => {
    const cached = get().profiles[userId]
    const fresh = Date.now() - (get().fetchedAt[userId] ?? 0) < PROFILE_TTL_MS
    if (cached && fresh && !force) return Promise.resolve(cached)
    const pending = inflight.get(userId)
    if (pending) return pending

    const promise = getProfile(userId)
      .then((profile) => {
        get().apply(profile)
        return profile
      })
      .catch((err) => {
        console.error('[profileStore] fetchProfile error:', err)
        return cached ?? null
      })
      .finally(() => inflight.delete(userId))
    inflight.set(userId, promise)
    return promise
  },

  apply: (profile) =>
    set((state) => ({
      profiles: {
        ...state.profiles,
        [profile.id]: mergeProfile(state.profiles[profile.id], profile)
      },
      fetchedAt: { ...state.fetchedAt, [profile.id]: Date.now() }
    })),

  reset: () => {
    inflight.clear()
    set({ profiles: {}, fetchedAt: {} })
  }
}))

/**
 * Nome e avatar mais novos de alguém: o do perfil conhecido, senão o que veio
 * junto com a mensagem/membro/amigo.
 */
export function useUserLook(userId: string | undefined, fallback: LookFallback): UserLook {
  const profile = useProfileStore((s) => (userId ? s.profiles[userId] : undefined))
  return lookOf(profile, fallback)
}

/** O que veio junto com a mensagem/membro/amigo. */
export interface LookFallback {
  name: string
  avatarUrl?: string | null
  nameplateUrl?: string | null
  decorationUrl?: string | null
}

export interface UserLook {
  name: string
  avatarUrl: string | null
  /** Faixa efetiva (banner ou imagem própria); null = sem faixa. */
  nameplateUrl: string | null
  decorationUrl: string | null
}

/** O perfil conhecido ganha de tudo (inclusive quando tirou a faixa). */
export function lookOf(profile: PublicProfile | undefined, fallback: LookFallback): UserLook {
  if (!profile) {
    return {
      name: fallback.name,
      avatarUrl: fallback.avatarUrl ?? null,
      nameplateUrl: fallback.nameplateUrl ?? null,
      decorationUrl: fallback.decorationUrl ?? null
    }
  }
  return {
    name: profile.display_name || fallback.name,
    avatarUrl: profile.avatar_url ?? null,
    nameplateUrl: profile.nameplate_url ?? null,
    decorationUrl: profile.avatar_decoration_url ?? null
  }
}
