import { create } from 'zustand'

// Menu do botão direito sobre um usuário (participante de chamada ou membro).

export interface UserMenuTarget {
  userId: string
  name: string
  /** para o pedido de amizade */
  username?: string
  /** menu da live (tela compartilhada) dessa pessoa, em vez do menu dela */
  stream?: boolean
  /** Aberto numa DM 1:1: mostra "Fechar DM". */
  conversationId?: string
  x: number
  y: number
  /** Elemento que disparou o menu (ex.: botão 3 pontinhos no cartão). */
  anchorEl?: HTMLElement
}

interface UserMenuState {
  target: UserMenuTarget | null
  open: (target: UserMenuTarget) => void
  close: () => void
}

export const useUserMenuStore = create<UserMenuState>()((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null })
}))

/**
 * onContextMenu pronto para um usuário. Em você mesmo só abre com allowSelf
 * (lista de membros do servidor, canal de voz e palco: permite alterar apelido,
 * cargos e liberar/silenciar a si mesmo).
 */
export function userMenuHandler(
  userId: string,
  name: string,
  meId: string | undefined,
  username?: string,
  { allowSelf = false }: { allowSelf?: boolean } = {}
): ((e: React.MouseEvent) => void) | undefined {
  if (!userId || (userId === meId && !allowSelf)) return undefined
  return (e) => {
    e.preventDefault()
    useUserMenuStore.getState().open({ userId, name, username, x: e.clientX, y: e.clientY })
  }
}

/** onContextMenu da live (tela compartilhada) de alguém: volume e silenciar. */
export function streamMenuHandler(
  userId: string,
  name: string,
  meId: string | undefined
): ((e: React.MouseEvent) => void) | undefined {
  if (!userId || userId === meId) return undefined
  return (e) => {
    e.preventDefault()
    useUserMenuStore.getState().open({ userId, name, stream: true, x: e.clientX, y: e.clientY })
  }
}
