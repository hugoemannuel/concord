import { create } from 'zustand'
import { getServerCard, type ServerCard, type ServerProfile } from '../api/serverProfile'

// O perfil dos servidores abertos nesta sessão (faixa, fundo, cartão): um pedido
// por servidor e o resto por evento (server:profile).

interface ServerProfileState {
  byServer: Record<string, ServerProfile>
  /** Busca uma vez por servidor; sem acesso ou sem rede, fica sem perfil. */
  load: (serverId: string) => void
  setProfile: (serverId: string, profile: ServerProfile) => void
  /** Guarda o cartão recém-salvo (sem esperar o evento). */
  setCard: (serverId: string, card: ServerCard) => void
}

const requested = new Set<string>()

export const useServerProfileStore = create<ServerProfileState>()((set, get) => ({
  byServer: {},
  load: (serverId) => {
    if (requested.has(serverId)) return
    requested.add(serverId)
    getServerCard(serverId)
      .then((card) => get().setCard(serverId, card))
      .catch(() => requested.delete(serverId))
  },
  setProfile: (serverId, profile) =>
    set((s) => ({ byServer: { ...s.byServer, [serverId]: profile } })),
  setCard: (serverId, card) => {
    if (card.profile && card.is_member) get().setProfile(serverId, card.profile)
  }
}))

/** Esquece o que já foi pedido (só nos testes). */
export function resetServerProfileRequests(): void {
  requested.clear()
}
