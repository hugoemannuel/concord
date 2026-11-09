import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ApiError } from '../../../shared/api/client'
import { showToast } from '../../../shared/store/toastStore'
import { uploadAttachment } from '../api/attachments'
import type { Message } from '../api/messages'
import {
  canSubmit,
  draftStatus,
  uploadErrorMessage,
  type DraftAttachment
} from '../lib/attachments'
import {
  reportSendFailure,
  sendErrorText,
  type ReplyState,
  type SentMessage
} from '../lib/sendFailure'
import { slowmodeErrorText, slowmodeRetryAfter } from '../lib/slowmode'
import { useChatStore } from '../store/chatStore'
import type { Slowmode } from './useSlowmode'
import { useRoomState } from './useRoomState'

interface Options {
  room: string
  /** Sala atual, para um envio que termina depois da troca de sala não limpar o campo da nova. */
  roomRef: { current: string }
  inputRef: React.RefObject<HTMLTextAreaElement | null>
  draft: string
  setDraft: Dispatch<SetStateAction<string>>
  drafts: DraftAttachment[]
  removeAttachment: (localId: string) => void
  replyingTo: Message | null
  setReplyState: Dispatch<SetStateAction<ReplyState | null>>
  /** A lista volta a acompanhar o fim (a própria mensagem aparece embaixo). */
  followBottom: () => void
  /** Limpa o que o envio leva embora além do texto (aviso de digitando, menu do @). */
  onSent: () => void
  /** Modo lento da sala: trava o envio na espera e conta a vez depois de enviar. */
  slowmode?: Pick<Slowmode, 'blocked' | 'onSent' | 'onFailed'>
}

/** Ids dos anexos que já subiram: só eles saem do rascunho quando o envio dá certo. */
const doneDraftIds = (drafts: DraftAttachment[]): string[] =>
  drafts.filter((d) => d.status === 'done').map((d) => d.localId)

/** Falha do áudio gravado: modo lento diz quanto falta; o resto, o aviso do upload. */
const voiceErrorText = (err: unknown): string => {
  const retryAfter = slowmodeRetryAfter(err)
  if (retryAfter !== null) return slowmodeErrorText(retryAfter)
  return uploadErrorMessage(err instanceof ApiError ? err.status : 0)
}

/** Envio do campo de mensagem (texto, anexos, resposta) e do áudio gravado. */
export function useComposerSend(o: Options): {
  sending: boolean
  sendingVoice: boolean
  submittable: boolean
  uploading: boolean
  handleSubmit: (e: React.FormEvent) => Promise<void>
  handleRecorded: (blob: Blob, durationMs: number) => Promise<void>
} {
  const sendToRoom = useChatStore((s) => s.sendToRoom)
  const [sending, setSending] = useRoomState(o.room, false)
  const [sendingVoice, setSendingVoice] = useState(false)
  // Envio que falha depois de sair do chat não mexe no campo (só oferece copiar).
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])
  const attachmentState = draftStatus(o.drafts)
  const submittable = canSubmit(o.draft, o.drafts) && !o.slowmode?.blocked
  const ready = submittable && !sending
  const replyId = o.replyingTo?.id ?? null

  // O texto que falhou nunca se perde (ver lib/sendFailure).
  const reportFailure = (message: string, sent: SentMessage): void =>
    reportSendFailure(message, sent, {
      mounted: () => mountedRef.current,
      currentRoom: () => o.roomRef.current,
      currentText: () => o.inputRef.current?.value ?? '',
      setDraft: o.setDraft,
      setReply: o.setReplyState,
      focusInput: () => requestAnimationFrame(() => o.inputRef.current?.focus()),
      error: showToast.error,
      copy: (text) => void navigator.clipboard?.writeText(text)
    })

  const clearSentDrafts = (sentRoom: string, sentDrafts: string[]): void => {
    if (o.roomRef.current === sentRoom) sentDrafts.forEach(o.removeAttachment)
  }

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    if (!ready) return
    setSending(true)
    // A própria mensagem (e o "enviando…") aparece embaixo: acompanha.
    o.followBottom()
    const sent: SentMessage = { room: o.room, text: o.draft, reply: o.replyingTo }
    // Só sai do rascunho o que foi enviado: arquivo adicionado durante o envio fica.
    const sentDrafts = doneDraftIds(o.drafts)
    // O texto sai do campo na hora: dá para começar a próxima mensagem sem
    // esperar o servidor. Os anexos só saem quando o envio dá certo.
    o.onSent()
    o.setDraft('')
    o.setReplyState(null)
    try {
      await sendToRoom(o.room, sent.text.trim(), attachmentState.readyIds, replyId)
      o.slowmode?.onSent()
      clearSentDrafts(sent.room, sentDrafts)
    } catch (err) {
      o.slowmode?.onFailed(err)
      reportFailure(sendErrorText(err), sent)
    } finally {
      setSending(false)
    }
  }

  // Áudio gravado vai sozinho; o texto digitado continua no campo.
  const handleRecorded = async (blob: Blob, durationMs: number): Promise<void> => {
    setSendingVoice(true)
    try {
      const attachment = await uploadAttachment(o.room, blob, {
        filename: 'gravacao.webm',
        duration_ms: durationMs
      })
      await sendToRoom(o.room, '', [attachment.id])
      o.slowmode?.onSent()
    } catch (err) {
      o.slowmode?.onFailed(err)
      showToast.error(voiceErrorText(err))
    } finally {
      setSendingVoice(false)
    }
  }

  return {
    sending,
    sendingVoice,
    submittable,
    uploading: attachmentState.uploading,
    handleSubmit,
    handleRecorded
  }
}
