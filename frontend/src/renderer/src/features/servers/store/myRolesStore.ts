import { create } from 'zustand'
import { listMyServerRoles } from '../api/roles'
import { sessionGuard } from '../../auth/lib/sessionGuard'
import { useAuthStore } from '../../auth/store/authStore'

/**
 * Os meus cargos em cada servidor (não só no que está aberto): é o que diz se
 * uma menção de cargo é para mim e soma no selo de menção de qualquer
 * servidor (ADR 0065). Carrega pela rota própria e segue o server:member:roles.
 */
interface MyRolesState {
  /** De quem são os cargos guardados (outra conta não os herda). */
  userId: string | null
  /** id do servidor -> ids dos meus cargos (sem o @everyone). */
  byServer: Record<string, string[]>
  fetchMyRoles: () => Promise<void>
  setServerRoles: (userId: string, serverId: string, roleIds: string[]) => void
  removeServer: (serverId: string) => void
}

const NONE: string[] = []

export const useMyRolesStore = create<MyRolesState>()((set) => ({
  userId: null,
  byServer: {},

  fetchMyRoles: async () => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    const sameSession = sessionGuard()
    try {
      const byServer = await listMyServerRoles()
      if (sameSession()) set({ userId, byServer: byServer ?? {} })
    } catch (err) {
      console.error('[myRolesStore] fetchMyRoles error:', err)
    }
  },

  setServerRoles: (userId, serverId, roleIds) =>
    set((s) => ({
      userId,
      byServer: { ...(s.userId === userId ? s.byServer : {}), [serverId]: roleIds }
    })),

  removeServer: (serverId) =>
    set((s) => {
      const byServer = { ...s.byServer }
      delete byServer[serverId]
      return { byServer }
    })
}))

/** Os cargos de `userId` num servidor, a partir do que o store guarda. */
export function roleIdsOf(
  state: Pick<MyRolesState, 'userId' | 'byServer'>,
  userId: string | null | undefined,
  serverId: string | null | undefined
): string[] {
  if (!userId || !serverId || state.userId !== userId) return NONE
  return state.byServer[serverId] ?? NONE
}

/** Os meus cargos no servidor, agora (fora de componente). */
export function myRoleIdsIn(serverId: string | null | undefined): string[] {
  return roleIdsOf(useMyRolesStore.getState(), useAuthStore.getState().user?.id, serverId)
}
