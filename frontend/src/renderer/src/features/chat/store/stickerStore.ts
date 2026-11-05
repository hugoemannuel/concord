import { create } from 'zustand'
import type { WsEvent } from '../../../shared/api/ws'
import {
  type ServerSticker,
  fetchMyStickers,
  uploadServerSticker,
  deleteServerSticker
} from '../api/stickers'
import { updateServerSticker } from '../../expressions/api/expressions'

interface StickerState {
  stickersByServer: Record<string, ServerSticker[]>
  /** As figurinhas de todos os servidores da pessoa, numa consulta só (false se falhou). */
  loadMine: () => Promise<boolean>
  uploadSticker: (
    serverId: string,
    name: string,
    file: Blob,
    filename?: string
  ) => Promise<ServerSticker>
  /** Troca o nome (o arquivo fica). */
  renameSticker: (serverId: string, stickerId: string, name: string) => Promise<ServerSticker>
  deleteSticker: (serverId: string, stickerId: string) => Promise<void>
  handleWsEvent: (event: WsEvent) => boolean
}

type ByServer = StickerState['stickersByServer']
type Edit = (list: ServerSticker[]) => ServerSticker[]

// Sem figurinhas, devolva sempre a mesma referência: um `[]` novo por leitura
// faz o zustand v5 entrar em loop de render (React #185).
const NO_STICKERS: ServerSticker[] = []

export const selectStickers =
  (serverId?: string | null) =>
  (s: Pick<StickerState, 'stickersByServer'>): ServerSticker[] =>
    serverId ? (s.stickersByServer[serverId] ?? NO_STICKERS) : NO_STICKERS

/** A lista do servidor depois da mudança. */
const editServer = (
  byServer: ByServer,
  serverId: string,
  edit: Edit
): { stickersByServer: ByServer } => ({
  stickersByServer: { ...byServer, [serverId]: edit(byServer[serverId] ?? []) }
})

const prepend =
  (sticker: ServerSticker): Edit =>
  (list) =>
    list.some((x) => x.id === sticker.id) ? list : [sticker, ...list]

const replace =
  (sticker: ServerSticker): Edit =>
  (list) =>
    list.map((x) => (x.id === sticker.id ? sticker : x))

const without =
  (stickerId: string): Edit =>
  (list) =>
    list.filter((x) => x.id !== stickerId)

interface StickerPayload {
  server_id?: string
  sticker?: ServerSticker
  sticker_id?: string
}

/** A mudança que cada evento pede (null se o payload não traz o necessário). */
const WS_EDITS: Record<string, (p: StickerPayload) => Edit | null> = {
  'sticker:created': (p) => (p.sticker ? prepend(p.sticker) : null),
  'sticker:updated': (p) => (p.sticker ? replace(p.sticker) : null),
  'sticker:deleted': (p) => (p.sticker_id ? without(p.sticker_id) : null)
}

export const useStickerStore = create<StickerState>((set) => {
  const apply = (serverId: string, edit: Edit): void =>
    set((s) => editServer(s.stickersByServer, serverId, edit))

  return {
    stickersByServer: {},

    loadMine: async () => {
      try {
        const groups = await fetchMyStickers()
        set({ stickersByServer: Object.fromEntries(groups.map((g) => [g.server_id, g.stickers])) })
        return true
      } catch {
        // Sem rede: o seletor fica com o que já tinha carregado.
        return false
      }
    },

    uploadSticker: async (serverId, name, file, filename) => {
      const created = await uploadServerSticker(serverId, name, file, filename)
      apply(serverId, prepend(created))
      return created
    },

    renameSticker: async (serverId, stickerId, name) => {
      const updated = await updateServerSticker(serverId, stickerId, name)
      apply(serverId, replace(updated))
      return updated
    },

    deleteSticker: async (serverId, stickerId) => {
      await deleteServerSticker(serverId, stickerId)
      apply(serverId, without(stickerId))
    },

    handleWsEvent: (event: WsEvent) => {
      const payload = (event.payload ?? {}) as StickerPayload
      const edit = WS_EDITS[event.type]?.(payload)
      if (!payload.server_id || !edit) return false
      apply(payload.server_id, edit)
      return true
    }
  }
})
