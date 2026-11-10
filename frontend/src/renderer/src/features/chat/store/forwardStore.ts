import { create } from 'zustand'
import type { Message } from '../api/messages'

/** A mensagem sendo encaminhada (o seletor de destino fica aberto enquanto houver uma). */
interface ForwardState {
  message: Message | null
  open: (message: Message) => void
  close: () => void
}

export const useForwardStore = create<ForwardState>((set) => ({
  message: null,
  open: (message) => set({ message }),
  close: () => set({ message: null })
}))
