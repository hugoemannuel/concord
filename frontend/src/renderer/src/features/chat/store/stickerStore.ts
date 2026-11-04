import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import {
  type ServerSticker,
  fetchMyStickers,
  fetchServerStickers,
  uploadServerSticker,
  deleteServerSticker
} from '../api/stickers'

interface StickerState {
  stickersByServer: Record<string, ServerSticker[]>
  loadingByServer: Record<string, boolean>
  loadStickers: (serverId: string) => Promise<void>
  /** As figurinhas de todos os servidores da pessoa, numa consulta só. */
  loadMine: () => Promise<void>
  uploadSticker: (
    serverId: string,
    name: string,
    file: Blob,
    filename?: string
  ) => Promise<ServerSticker>
  deleteSticker: (serverId: string, stickerId: string) => Promise<void>
  handleWsEvent: (event: WsEvent) => boolean
}

// Sem figurinhas, devolva sempre a mesma referência: um `[]` novo por leitura
// faz o zustand v5 entrar em loop de render (React #185).
const NO_STICKERS: ServerSticker[] = []

export const selectStickers =
  (serverId?: string | null) =>
  (s: Pick<StickerState, 'stickersByServer'>): ServerSticker[] =>
    serverId ? (s.stickersByServer[serverId] ?? NO_STICKERS) : NO_STICKERS

export const useStickerStore = create<StickerState>((set) => ({
  stickersByServer: {},
  loadingByServer: {},

  loadStickers: async (serverId: string) => {
    if (!serverId) return
    set((s) => ({ loadingByServer: { ...s.loadingByServer, [serverId]: true } }))
    try {
      const stickers = await fetchServerStickers(serverId)
      set((s) => ({
        stickersByServer: { ...s.stickersByServer, [serverId]: stickers },
        loadingByServer: { ...s.loadingByServer, [serverId]: false }
      }))
    } catch {
      set((s) => ({
        loadingByServer: { ...s.loadingByServer, [serverId]: false }
      }))
    }
  },

  loadMine: async () => {
    try {
      const groups = await fetchMyStickers()
      set({ stickersByServer: Object.fromEntries(groups.map((g) => [g.server_id, g.stickers])) })
    } catch {
      // Sem rede: o seletor fica com o que já tinha carregado.
    }
  },

  uploadSticker: async (serverId, name, file, filename) => {
    const created = await uploadServerSticker(serverId, name, file, filename)
    set((s) => {
      const current = s.stickersByServer[serverId] ?? []
      if (current.some((x) => x.id === created.id)) return s
      return {
        stickersByServer: {
          ...s.stickersByServer,
          [serverId]: [created, ...current]
        }
      }
    })
    return created
  },

  deleteSticker: async (serverId, stickerId) => {
    await deleteServerSticker(serverId, stickerId)
    set((s) => {
      const current = s.stickersByServer[serverId] ?? []
      return {
        stickersByServer: {
          ...s.stickersByServer,
          [serverId]: current.filter((x) => x.id !== stickerId)
        }
      }
    })
  },

  handleWsEvent: (event: WsEvent) => {
    const payload = (event.payload ?? {}) as Record<string, unknown>
    const serverId = payload.server_id as string | undefined

    if (event.type === 'sticker:created') {
      const sticker = payload.sticker as ServerSticker | undefined
      if (!serverId || !sticker) return false
      set((s) => {
        const current = s.stickersByServer[serverId] ?? []
        if (current.some((x) => x.id === sticker.id)) return s
        return {
          stickersByServer: {
            ...s.stickersByServer,
            [serverId]: [sticker, ...current]
          }
        }
      })
      return true
    }

    if (event.type === 'sticker:deleted') {
      const stickerId = payload.sticker_id as string | undefined
      if (!serverId || !stickerId) return false
      set((s) => {
        const current = s.stickersByServer[serverId] ?? []
        return {
          stickersByServer: {
            ...s.stickersByServer,
            [serverId]: current.filter((x) => x.id !== stickerId)
          }
        }
      })
      return true
    }

    return false
  }
}))
