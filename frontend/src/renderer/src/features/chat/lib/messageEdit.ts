import type { Message } from '../api/messages'
import { compareTimestamps, mergeMessages } from './messageOrder'

// Edição de mensagem (como no Discord): só o autor, só texto comum (nada de convite para a call).

/** Dá para editar? Sua mensagem, que não é do sistema, enquete nem só figurinha. */
export function canEditMessage(message: Message, meId: string | null | undefined): boolean {
  if (!meId || message.author_id !== meId || message.system_kind || message.poll || message.call_invite) return false
  // A encaminhada é a foto da original: o texto não é de quem encaminhou.
  if (message.forwarded_from) return false
  if ((message.sticker_id || message.sticker) && !message.content) return false
  return true
}

/** ↑ no campo vazio: a sua última mensagem editável da sala (ou null). */
export function lastEditableMessage(
  messages: Message[],
  meId: string | null | undefined
): Message | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (canEditMessage(messages[i], meId)) return messages[i]
  }
  return null
}

export type EditOutcome =
  { kind: 'unchanged' } | { kind: 'empty' } | { kind: 'save'; content: string }

/**
 * O que fazer ao salvar a edição: texto igual (aparado) só fecha; vazio só
 * vale em mensagem com anexo (como no envio); senão salva o texto aparado.
 */
export function editOutcome(original: string, draft: string, hasAttachments: boolean): EditOutcome {
  const content = draft.trim()
  if (content === original.trim()) return { kind: 'unchanged' }
  if (!content && !hasAttachments) return { kind: 'empty' }
  return { kind: 'save', content }
}

/** A edição `incoming` é mais antiga que a já aplicada em `current`? */
function isStale(current: Message, incoming: Message): boolean {
  if (!current.edited_at || !incoming.edited_at)
    return Boolean(current.edited_at && !incoming.edited_at)
  return compareTimestamps(incoming.edited_at, current.edited_at) < 0
}

/**
 * Aplica uma mensagem editada (message:update ou a resposta do PATCH) à
 * lista da sala. Só troca o que já está carregado — edição de mensagem fora
 * da lista não cria entrada solta — e ignora edição mais antiga que a da
 * tela (o PATCH e o WS chegam em qualquer ordem). Enquete e reações locais
 * ficam se a cópia não trouxer (os votos são por pessoa). Respostas a ela
 * ganham a prévia nova. A junção passa pelo mergeMessages: a posição
 * continua pelo created_at.
 */
export function applyMessageUpdate(existing: Message[], updated: Message): Message[] {
  const current = existing.find((m) => m.id === updated.id)
  if (!current || isStale(current, updated)) return existing

  const merged: Message = {
    ...current,
    ...updated,
    poll: updated.poll ?? current.poll,
    reactions: updated.reactions ?? current.reactions,
    attachments: updated.attachments ?? current.attachments,
    sticker: updated.sticker ?? current.sticker,
    gif_metadata: updated.gif_metadata ?? current.gif_metadata,
    reply_to: updated.reply_to ?? current.reply_to
  }
  const withReplies = existing.map((m) =>
    m.reply_to?.id === updated.id
      ? { ...m, reply_to: { ...m.reply_to, content: merged.content } }
      : m
  )
  return mergeMessages(withReplies, [merged])
}

const EDIT_ERRORS: Record<string, string> = {
  'content is too long': 'A mensagem passou do limite de caracteres.',
  'content is required': 'A mensagem não pode ficar vazia.',
  'this message cannot be edited': 'Essa mensagem não pode ser editada.'
}

/**
 * Aviso para uma edição que falhou, ou null para o tratamento geral
 * (falta de cargo, bloqueio, rede).
 */
export function editErrorMessage(err: unknown): string | null {
  if (!err || typeof err !== 'object') return null
  const { status, code, message } = err as { status?: number; code?: string; message?: string }
  if (code === 'not_author') return 'Só quem escreveu a mensagem pode editar.'
  if (status === 404) return 'Essa mensagem não existe mais.'
  if (status === 400 && message && EDIT_ERRORS[message]) return EDIT_ERRORS[message]
  return null
}
