import type { Message } from '../api/messages'
import { ApiError } from '../../../shared/api/client'
import { permissionError } from '../../servers/lib/permissions'
import { sendErrorMessage } from './attachments'
import {
  afterSendFailure,
  canRestoreHere,
  replyAfterRestore,
  restoreFailedText
} from './composerDraft'

// O texto que falhou nunca se perde: volta sozinho se o campo continua vazio;
// senão o aviso oferece "Restaurar" (vem antes do texto novo, com a resposta).
// Em outra sala o campo é de lá: o aviso oferece copiar.

export interface ReplyState {
  room: string
  message: Message
}

interface ToastAction {
  label: string
  run: () => void
}

/** O que a falha precisa do chat (campo, resposta, aviso e área de transferência). */
export interface SendFailureEnv {
  /** O ChatPane ainda está na tela? */
  mounted: () => boolean
  /** Sala aberta agora. */
  currentRoom: () => string
  /** O que está no campo agora. */
  currentText: () => string
  setDraft: (update: (now: string) => string) => void
  setReply: (update: (now: ReplyState | null) => ReplyState | null) => void
  focusInput: () => void
  error: (message: string, durationMs?: number, action?: ToastAction) => void
  copy: (text: string) => void
}

export interface SentMessage {
  room: string
  text: string
  reply: Message | null
}

export function reportSendFailure(message: string, sent: SentMessage, env: SendFailureEnv): void {
  const sentReply = sent.reply ? { room: sent.room, message: sent.reply } : null
  const here = (): boolean => canRestoreHere(env.mounted(), env.currentRoom(), sent.room)
  const copyAction = { label: 'Copiar', run: () => env.copy(sent.text) }
  if (!here()) {
    env.error(message, 10000, sent.text.trim() ? copyAction : undefined)
    return
  }
  const action = afterSendFailure(sent.text, sent.reply !== null, env.currentText())
  if (action === 'restore') {
    env.setDraft(() => sent.text)
    env.setReply((now) => replyAfterRestore(now, sentReply))
    env.error(message)
    return
  }
  if (action === 'nothing') {
    env.error(message)
    return
  }
  env.error(message, 10000, {
    label: 'Restaurar',
    run: () => restoreLater(sent, sentReply, copyAction, here, env)
  })
}

/** "Restaurar": põe o texto que falhou de volta, se ainda se está na mesma sala. */
function restoreLater(
  sent: SentMessage,
  sentReply: ReplyState | null,
  copyAction: ToastAction,
  here: () => boolean,
  env: SendFailureEnv
): void {
  if (!here()) {
    if (sent.text.trim()) {
      env.error('Você saiu da conversa: copie a mensagem que falhou.', 10000, copyAction)
    }
    return
  }
  env.setDraft((now) => restoreFailedText(sent.text, now))
  env.setReply((now) => replyAfterRestore(now, sentReply))
  env.focusInput()
}

/** Aviso de uma mensagem que não foi: permissão, erro da API ou falha de rede. */
export function sendErrorText(err: unknown): string {
  if (!(err instanceof ApiError)) return 'Falha ao enviar mensagem.'
  return permissionError(err.code, '') || sendErrorMessage(err.status, err.message)
}
