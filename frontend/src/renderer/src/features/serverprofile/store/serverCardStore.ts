import { create } from 'zustand'

// Qual cartão de servidor está aberto (tag, menu do servidor). Um por vez.
interface ServerCardState {
  serverId: string | null
  open: (serverId: string) => void
  close: () => void
}

export const useServerCardStore = create<ServerCardState>()((set) => ({
  serverId: null,
  open: (serverId) => set({ serverId }),
  close: () => set({ serverId: null })
}))
