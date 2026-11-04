import { create } from 'zustand'
import { profilesFromMembers, type MemberProfile } from '../lib/memberProfile'

// Os perfis de servidor conhecidos: serverId -> userId -> campos sobrescritos.
// Vêm junto com a lista de membros (mesma consulta) e pelo
// server:member:update. Quem não está aqui usa o perfil global.

interface MemberProfileState {
  byServer: Record<string, Record<string, MemberProfile>>
  /** A lista de membros de um servidor chegou (ou mudou). */
  ingestMembers: (
    serverId: string,
    members: { user_id: string; member_profile?: MemberProfile | null }[]
  ) => void
  /** O perfil de alguém mudou; sem perfil, a pessoa volta a ser só o global. */
  apply: (serverId: string, userId: string, profile: MemberProfile | null | undefined) => void
  forgetServer: (serverId: string) => void
  reset: () => void
}

const same = (a: unknown, b: unknown): boolean => a === b || JSON.stringify(a) === JSON.stringify(b)

/** Mantém os objetos que não mudaram: quem lê um perfil não redesenha à toa. */
function mergeServer(
  current: Record<string, MemberProfile> | undefined,
  next: Record<string, MemberProfile>
): Record<string, MemberProfile> {
  const out: Record<string, MemberProfile> = {}
  let changed = Object.keys(current ?? {}).length !== Object.keys(next).length
  for (const [userId, profile] of Object.entries(next)) {
    const old = current?.[userId]
    const keep = old && same(old, profile)
    out[userId] = keep ? old : profile
    if (!keep) changed = true
  }
  return changed || !current ? out : current
}

export const useMemberProfileStore = create<MemberProfileState>()((set, get) => ({
  byServer: {},

  ingestMembers: (serverId, members) => {
    const current = get().byServer[serverId]
    const next = mergeServer(current, profilesFromMembers(members))
    if (next !== current) set({ byServer: { ...get().byServer, [serverId]: next } })
  },

  apply: (serverId, userId, profile) => {
    const server = get().byServer[serverId] ?? {}
    if (!profile && !server[userId]) return
    if (profile && server[userId] && same(server[userId], profile)) return
    const next = { ...server }
    if (profile) next[userId] = profile
    else delete next[userId]
    set({ byServer: { ...get().byServer, [serverId]: next } })
  },

  forgetServer: (serverId) => {
    if (!get().byServer[serverId]) return
    const byServer = { ...get().byServer }
    delete byServer[serverId]
    set({ byServer })
  },

  reset: () => set({ byServer: {} })
}))
