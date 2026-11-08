import { create } from 'zustand'
import { getLinkPreview, suppressEmbeds, type LinkPreview } from '../api/linkPreviews'
import type { Message } from '../../chat/api/messages'
import { useChatStore } from '../../chat/store/chatStore'
import { withUpdatedMessage } from '../../chat/lib/roomMessages'
import { roomKeyOf } from '../../chat/store/wsEvents/context'

export type LinkPreviewEntry =
  | { status: 'loading' }
  | { status: 'ready'; preview: LinkPreview }
  /** A página não tem cartão (o servidor guarda a falha por 24 h). */
  | { status: 'none' }
  /** Falha passageira (limite, rede): tenta de novo quando o cartão aparecer outra vez. */
  | { status: 'error' }

interface LinkPreviewState {
  entries: Record<string, LinkPreviewEntry>
  /** Busca a prévia da URL se ainda não tem (ou se a última falha foi passageira). */
  ensure: (url: string) => void
  /** O X do autor: tira as prévias da mensagem para todo mundo. */
  removeEmbeds: (message: Message) => Promise<void>
  reset: () => void
}

/**
 * Prévia dos links das mensagens, uma busca por URL na sessão (o mesmo link
 * aparece em várias mensagens e o servidor limita as buscas por pessoa).
 */
export const useLinkPreviewStore = create<LinkPreviewState>()((set, get) => ({
  entries: {},
  ensure: (url) => {
    const current = get().entries[url]
    if (current && current.status !== 'error') return
    const put = (entry: LinkPreviewEntry): void =>
      set((s) => ({ entries: { ...s.entries, [url]: entry } }))
    put({ status: 'loading' })
    getLinkPreview(url)
      .then((preview) => put(preview ? { status: 'ready', preview } : { status: 'none' }))
      .catch(() => put({ status: 'error' }))
  },
  removeEmbeds: async (message) => {
    const room = roomKeyOf(message.channel_id, message.conversation_id)
    const updated = await suppressEmbeds(room, message.id)
    // A sala também recebe o message:update; aplicar a resposta já some na hora.
    useChatStore.setState((state) => withUpdatedMessage(state, room, updated))
  },
  reset: () => set({ entries: {} })
}))
