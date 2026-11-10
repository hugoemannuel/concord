import { create } from 'zustand'
import type { DirectPowers } from '../lib/castigo'

/** Quem vai receber o castigo e de onde o modal foi aberto. */
export interface CastigoTarget extends DirectPowers {
  serverId: string
  userId: string
  name: string
  /** A call em que os dois estão (sem ela, só o castigo direto). */
  callId?: string
}

interface CastigoDialogState {
  target: CastigoTarget | null
  open: (target: CastigoTarget) => void
  close: () => void
}

export const useCastigoDialogStore = create<CastigoDialogState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null })
}))
