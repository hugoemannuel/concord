import { create } from 'zustand'
import { getServerCard, type ServerCard, type ServerProfile } from '../api/serverProfile'

// O perfil dos servidores abertos nesta sessão (faixa, fundo, cartão): um pedido
// por servidor e o resto por evento (server:profile). Depois de um tempo, abrir o
// servidor busca de novo: um evento pode ter se perdido numa queda de conexão.

export const PROFILE_REFRESH_MS = 5 * 60 * 1000

interface ServerProfileState {
  byServer: Record<string, ServerProfile>
  /** Busca se faz tempo; sem acesso ou sem rede, fica como está. */
  load: (serverId: string) => void
  setProfile: (serverId: string, profile: ServerProfile) => void
  /** Guarda o cartão recém-salvo (sem esperar o evento). */
  setCard: (serverId: string, card: ServerCard) => void
}

const requestedAt = new Map<string, number>()

export const useServerProfileStore = create<ServerProfileState>()((set, get) => ({
  byServer: {},
  load: (serverId) => {
    const at = requestedAt.get(serverId)
    if (at !== undefined && Date.now() - at < PROFILE_REFRESH_MS) return
    requestedAt.set(serverId, Date.now())
    getServerCard(serverId)
      .then((card) => get().setCard(serverId, card))
      .catch(() => requestedAt.delete(serverId))
  },
  setProfile: (serverId, profile) =>
    set((s) => ({ byServer: { ...s.byServer, [serverId]: profile } })),
  setCard: (serverId, card) => {
    if (card.profile && card.is_member) get().setProfile(serverId, card.profile)
  }
}))

/** Esquece o que já foi pedido (só nos testes). */
export function resetServerProfileRequests(): void {
  requestedAt.clear()
}
