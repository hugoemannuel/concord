import { create } from 'zustand'

// "Ocultar canais silenciados": preferência de cada pessoa em cada servidor, guardada
// no aparelho como as categorias recolhidas.

const storageKey = (userId: string, serverId: string): string => `salinha-ocultar-silenciados-v1:${userId}:${serverId}`

function readSaved(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

interface HideMutedState {
  /** Só o que já foi lido ou mudado nesta sessão. */
  byKey: Record<string, boolean>
  isOn: (userId: string, serverId: string) => boolean
  toggle: (userId: string, serverId: string) => void
}

export const useHideMutedStore = create<HideMutedState>((set, get) => ({
  byKey: {},
  isOn: (userId, serverId) => {
    const key = storageKey(userId, serverId)
    return get().byKey[key] ?? readSaved(key)
  },
  toggle: (userId, serverId) => {
    const key = storageKey(userId, serverId)
    const next = !get().isOn(userId, serverId)
    set((state) => ({ byKey: { ...state.byKey, [key]: next } }))
    try {
      localStorage.setItem(key, next ? '1' : '0')
    } catch {
      /* preferência só na sessão */
    }
  }
}))
