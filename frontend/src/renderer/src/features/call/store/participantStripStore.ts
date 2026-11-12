import { create } from 'zustand'

const KEY = 'concord:participant-strip-hidden'

// Lembrado neste computador; sem armazenamento disponível, começa visível.
function load(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

function save(hidden: boolean): void {
  try {
    localStorage.setItem(KEY, hidden ? '1' : '0')
  } catch {
    // Sem armazenamento: vale só até fechar o app.
  }
}

interface ParticipantStripState {
  /** Faixa de participantes (embaixo da live em destaque ou do mosaico) oculta. */
  hidden: boolean
  toggle: () => void
}

export const useParticipantStripStore = create<ParticipantStripState>()((set, get) => ({
  hidden: load(),
  toggle: () => {
    const hidden = !get().hidden
    save(hidden)
    set({ hidden })
  }
}))
