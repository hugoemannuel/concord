import { errorMessage } from '../../../shared/lib/errorMessage'
import { create } from 'zustand'
import {
  type PinnedMessage,
  type Message,
  listChannelPins,
  pinChannelMessage,
  unpinChannelMessage
} from '../api/messages'
import { showToast } from '../../../shared/store/toastStore'

interface PinState {
  pinsByChannel: Record<string, PinnedMessage[]>
  loadingByChannel: Record<string, boolean>
  loadPins: (channelId: string) => Promise<PinnedMessage[]>
  pin: (channelId: string, messageId: string) => Promise<void>
  unpin: (channelId: string, messageId: string) => Promise<void>
  onPinAdd: (channelId: string, message: PinnedMessage) => void
  onPinRemove: (channelId: string, messageId: string) => void
  onMessageDelete: (messageId: string) => void
  onMessageUpdate: (message: Message) => void
}

// Sem fixadas, devolva sempre a mesma referência: um `[]` novo por leitura faz
// o zustand v5 entrar em loop de render (React #185).
const NO_PINS: PinnedMessage[] = []

export const selectPins =
  (channelId: string) =>
  (s: Pick<PinState, 'pinsByChannel'>): PinnedMessage[] =>
    s.pinsByChannel[channelId] ?? NO_PINS

export const usePinStore = create<PinState>((set, get) => ({
  pinsByChannel: {},
  loadingByChannel: {},

  loadPins: async (channelId: string) => {
    set((s) => ({
      loadingByChannel: { ...s.loadingByChannel, [channelId]: true }
    }))
    try {
      const pins = await listChannelPins(channelId)
      set((s) => ({
        pinsByChannel: { ...s.pinsByChannel, [channelId]: pins },
        loadingByChannel: { ...s.loadingByChannel, [channelId]: false }
      }))
      return pins
    } catch {
      set((s) => ({
        loadingByChannel: { ...s.loadingByChannel, [channelId]: false }
      }))
      return []
    }
  },

  pin: async (channelId: string, messageId: string) => {
    try {
      const pinned = await pinChannelMessage(channelId, messageId)
      get().onPinAdd(channelId, pinned)
      showToast.success('Mensagem fixada com sucesso!')
    } catch (err: unknown) {
      const errorMsg = errorMessage(err, 'Falha ao fixar mensagem. Verifique suas permissões.')
      showToast.error(errorMsg)
      throw err
    }
  },

  unpin: async (channelId: string, messageId: string) => {
    try {
      await unpinChannelMessage(channelId, messageId)
      get().onPinRemove(channelId, messageId)
      showToast.info('Mensagem desafixada.')
    } catch (err: unknown) {
      const errorMsg = errorMessage(err, 'Falha ao desafixar mensagem.')
      showToast.error(errorMsg)
      throw err
    }
  },

  onPinAdd: (channelId: string, message: PinnedMessage) => {
    set((s) => {
      const current = s.pinsByChannel[channelId] ?? []
      const filtered = current.filter((p) => p.id !== message.id)
      return {
        pinsByChannel: {
          ...s.pinsByChannel,
          [channelId]: [message, ...filtered]
        }
      }
    })
  },

  onPinRemove: (channelId: string, messageId: string) => {
    set((s) => {
      const current = s.pinsByChannel[channelId] ?? []
      return {
        pinsByChannel: {
          ...s.pinsByChannel,
          [channelId]: current.filter((p) => p.id !== messageId)
        }
      }
    })
  },

  onMessageDelete: (messageId: string) => {
    set((s) => {
      let changed = false
      const updated: Record<string, PinnedMessage[]> = {}
      for (const [chId, pins] of Object.entries(s.pinsByChannel)) {
        const remaining = pins.filter((p) => p.id !== messageId)
        if (remaining.length !== pins.length) {
          changed = true
          updated[chId] = remaining
        } else {
          updated[chId] = pins
        }
      }
      return changed ? { pinsByChannel: updated } : s
    })
  },

  onMessageUpdate: (message: Message) => {
    set((s) => {
      let changed = false
      const updated: Record<string, PinnedMessage[]> = {}
      for (const [chId, pins] of Object.entries(s.pinsByChannel)) {
        const nextPins = pins.map((p) => {
          if (p.id === message.id) {
            changed = true
            return {
              ...p,
              content: message.content,
              edited_at: message.edited_at,
              reactions: message.reactions ?? p.reactions,
              attachments: message.attachments ?? p.attachments
            }
          }
          return p
        })
        updated[chId] = nextPins
      }
      return changed ? { pinsByChannel: updated } : s
    })
  }
}))
