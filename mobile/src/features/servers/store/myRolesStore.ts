import { create } from 'zustand'
import { useAuthStore } from '../../auth/store/authStore'
import { listMyServerRoles } from '../api/myRoles'

/** O evento server:member:roles: os cargos de um membro mudaram. */
export interface MemberRolesPayload {
  server_id?: string
  user_id?: string
  role_ids?: string[]
}

/**
 * Os meus cargos em cada servidor: é o que diz se uma menção de cargo é para mim (o aviso com o app aberto).
 * Mesma ideia do myRolesStore do desktop.
 */
interface MyRolesState {
  /** De quem são os cargos guardados (outra conta não os herda). */
  userId: string | null
  byServer: Record<string, string[]>
  load: () => Promise<void>
  /** Aplica o evento se ele é sobre mim; o de outra pessoa é ignorado. */
  applyMemberRoles: (meId: string, payload: MemberRolesPayload) => void
}

const NONE: string[] = []

export const useMyRolesStore = create<MyRolesState>()((set) => ({
  userId: null,
  byServer: {},
  load: async () => {
    const userId = useAuthStore.getState().user?.id
    if (!userId) return
    try {
      const byServer = await listMyServerRoles()
      // Trocou de conta enquanto carregava: a resposta não vale mais.
      if (useAuthStore.getState().user?.id === userId) set({ userId, byServer: byServer ?? {} })
    } catch {
      // Sem a rota, só a menção de cargo deixa de avisar; o resto segue.
    }
  },
  applyMemberRoles: (meId, payload) => {
    const serverId = payload.server_id
    if (!serverId || payload.user_id !== meId) return
    set((s) => ({
      userId: meId,
      byServer: { ...(s.userId === meId ? s.byServer : {}), [serverId]: payload.role_ids ?? [] }
    }))
  }
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
