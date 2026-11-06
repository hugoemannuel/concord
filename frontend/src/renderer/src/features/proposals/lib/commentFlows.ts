import { ApiError } from '../../../shared/api/client'
import { errorMessage } from '../../../shared/lib/errorMessage'

/** Texto do aviso quando a reação no comentário falha. */
export function reactError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'too_many_reactions') return 'Esse comentário já tem emojis demais.'
    if (err.code === 'email_not_verified') return 'Confirme seu e-mail para reagir.'
  }
  return err instanceof Error && err.message ? err.message : 'Não foi possível reagir.'
}

/** O que fazer ao salvar a edição: nada, só fechar (texto igual) ou salvar o texto novo. */
export type CommentEdit = 'skip' | 'unchanged' | { body: string }

export function commentEdit(
  draft: string,
  original: string,
  hasAttachments: boolean,
  busy: boolean
): CommentEdit {
  const body = draft.trim()
  // Só quem tem anexo pode ficar sem texto.
  if ((!body && !hasAttachments) || busy) return 'skip'
  if (body === original) return 'unchanged'
  return { body }
}

/** O que a edição do comentário usa de fora (store, estado da linha e aviso). */
export interface CommentEditDeps {
  save: (body: string) => Promise<unknown>
  /** Fecha o modo de edição. */
  done: () => void
  setBusy: (busy: boolean) => void
  error: (message: string) => void
}

export async function runCommentEdit(edit: CommentEdit, deps: CommentEditDeps): Promise<void> {
  if (edit === 'skip') return
  if (edit === 'unchanged') return deps.done()
  deps.setBusy(true)
  try {
    await deps.save(edit.body)
    deps.done()
  } catch (err) {
    deps.error(errorMessage(err, 'Não foi possível editar o comentário.'))
  } finally {
    deps.setBusy(false)
  }
}
