import { actionErrorMessage } from '../../servers/lib/permissionErrors'
import type { Message } from '../api/messages'
import { editErrorMessage, editOutcome } from './messageEdit'

/** O que salvar a edição precisa do chat. */
export interface EditSaveEnv {
  /** Sala em que a edição começou. */
  room: string
  /** Sala aberta agora (a pessoa pode ter trocado enquanto salvava). */
  currentRoom: () => string
  edit: (room: string, messageId: string, content: string) => Promise<unknown>
  close: () => void
  setSaving: (saving: boolean) => void
  error: (message: string) => void
}

/** A mensagem tem anexo, figurinha ou GIF (então pode ficar sem texto)? */
export function hasMedia(message: Message): boolean {
  return Boolean(
    message.attachments?.length || message.sticker_id || message.sticker || message.gif_url
  )
}

/**
 * Salva a edição: igual só fecha, vazio avisa, o resto vai ao servidor. Fecha
 * o editor só se a pessoa continua na sala de onde editou.
 */
export async function saveMessageEdit(
  message: Message,
  draft: string,
  env: EditSaveEnv
): Promise<void> {
  const outcome = editOutcome(message.content, draft, hasMedia(message))
  if (outcome.kind === 'unchanged') return env.close()
  if (outcome.kind === 'empty') return env.error('A mensagem não pode ficar vazia.')
  env.setSaving(true)
  try {
    await env.edit(env.room, message.id, outcome.content)
    if (env.currentRoom() === env.room) env.close()
  } catch (err) {
    env.error(editErrorMessage(err) ?? actionErrorMessage(err, 'Falha ao editar mensagem.'))
  } finally {
    env.setSaving(false)
  }
}
