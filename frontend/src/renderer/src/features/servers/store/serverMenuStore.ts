import { create } from 'zustand'

// O que o menu do ícone do servidor (botão direito no trilho) deixa pendente
// para um servidor que pode não ser o aberto. Quem executa e mostra é o
// `ServerMenuHosts` (montado no AppShell).

export type ServerConfirmKind = 'leave' | 'delete-server'

interface ServerMenuState {
  /**
   * Ação que depende da tela do servidor aberta (convite, configurações, criar
   * canal). Espera o servidor ficar aberto e roda uma vez.
   */
  pending: { serverId: string; run: () => void; at: number } | null
  /** Servidor em que o diálogo "Criar categoria" está aberto. */
  categoryFor: string | null
  /** Sair ou apagar um servidor que não é o aberto (o aberto usa o channelSidebarStore). */
  confirm: { serverId: string; kind: ServerConfirmKind } | null
  setPending: (serverId: string, run: () => void) => void
  clearPending: () => void
  askCategory: (serverId: string) => void
  closeCategory: () => void
  askConfirm: (serverId: string, kind: ServerConfirmKind) => void
  closeConfirm: () => void
}

export const useServerMenuStore = create<ServerMenuState>()((set) => ({
  pending: null,
  categoryFor: null,
  confirm: null,
  setPending: (serverId, run) => set({ pending: { serverId, run, at: Date.now() } }),
  clearPending: () => set({ pending: null }),
  askCategory: (serverId) => set({ categoryFor: serverId }),
  closeCategory: () => set({ categoryFor: null }),
  askConfirm: (serverId, kind) => set({ confirm: { serverId, kind } }),
  closeConfirm: () => set({ confirm: null })
}))
