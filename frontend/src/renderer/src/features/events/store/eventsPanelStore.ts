import { create } from 'zustand'

// Qual servidor está com o painel de eventos aberto (null = fechado). O menu do
// servidor abre; o próprio painel fecha.

interface EventsPanelState {
  serverId: string | null
  open: (serverId: string) => void
  close: () => void
}

export const useEventsPanelStore = create<EventsPanelState>((set) => ({
  serverId: null,
  open: (serverId) => set({ serverId }),
  close: () => set({ serverId: null })
}))
