import { create } from 'zustand'

// "Mostrar o fundo dos servidores" (Configurações → Aparência): vale neste
// computador, como a escolha do tema.

export const SERVER_THEME_PREF_KEY = 'salinha-server-themes'

function load(): boolean {
  try {
    return localStorage.getItem(SERVER_THEME_PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

interface ServerThemePrefState {
  enabled: boolean
  setEnabled: (enabled: boolean) => void
}

export const useServerThemePrefStore = create<ServerThemePrefState>()((set) => ({
  enabled: load(),
  setEnabled: (enabled) => {
    try {
      localStorage.setItem(SERVER_THEME_PREF_KEY, enabled ? 'on' : 'off')
    } catch {
      // Sem armazenamento: vale só até fechar o app.
    }
    set({ enabled })
  }
}))
