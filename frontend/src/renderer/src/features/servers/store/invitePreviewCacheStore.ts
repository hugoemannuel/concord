import { create } from 'zustand'
import { getInvitePreview, type InvitePreview } from '../api/invites'
import { inviteErrorMessage } from '../lib/invitePreview'
import { statusOf } from '../../auth/lib/loginError'

export type InvitePreviewEntry =
  | { status: 'loading' }
  | { status: 'ready'; preview: InvitePreview }
  | { status: 'error'; message: string; retry: boolean }

interface InvitePreviewCacheState {
  entries: Record<string, InvitePreviewEntry>
  /** Busca a prévia do código se ainda não tem (ou se a última falha foi passageira). */
  ensure: (code: string) => void
  reset: () => void
}

/** Já tem resposta que vale (ou está chegando): não busca de novo. */
function settled(entry: InvitePreviewEntry | undefined): boolean {
  return !!entry && !(entry.status === 'error' && entry.retry)
}

/**
 * Prévia dos convites que aparecem como cartão no chat, uma busca por código
 * na sessão: a rota é pública e limitada por IP, e o mesmo link aparece em
 * várias mensagens. Convite inválido (404) fica guardado; falha passageira
 * (limite, rede) tenta de novo quando o cartão aparecer outra vez.
 */
export const useInvitePreviewCache = create<InvitePreviewCacheState>()((set, get) => ({
  entries: {},
  ensure: (code) => {
    if (settled(get().entries[code])) return
    const put = (entry: InvitePreviewEntry): void =>
      set((s) => ({ entries: { ...s.entries, [code]: entry } }))
    put({ status: 'loading' })
    getInvitePreview(code, true)
      .then((preview) => put({ status: 'ready', preview }))
      .catch((err: unknown) =>
        put({ status: 'error', message: inviteErrorMessage(err), retry: statusOf(err) !== 404 })
      )
  },
  reset: () => set({ entries: {} })
}))
