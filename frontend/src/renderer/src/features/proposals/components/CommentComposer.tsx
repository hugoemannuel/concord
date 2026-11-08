import { useEffect, useMemo, useRef, useState } from 'react'
import { uploadCommentAttachment } from '../api/proposals'
import type { ProposalComment } from '../api/proposals'
import { ApiError } from '../../../shared/api/client'
import { searchUsers } from '../../profile/api/users'
import {
  ACCEPT_ATTRIBUTE,
  canSubmit,
  draftStatus,
  sendErrorMessage,
  uploadErrorMessage
} from '../../chat/lib/attachments'
import { applyMention, mentionQuery, mentionSuggestions } from '../../chat/lib/mentions'
import { MAX_COMMENT, mentionIdsIn } from '../lib/proposals'
import { commentButtonLabel, commentPlaceholder } from '../lib/commentComposer'
import type { PublicUser } from '../../auth/store/authStore'
import { useAuthStore } from '../../auth/store/authStore'
import { useProposalStore } from '../store/proposalStore'
import { showToast } from '../../../shared/store/toastStore'
import Button from '../../../shared/ui/Button'
import ComposerAttachments from '../../chat/components/ComposerAttachments'
import { useAttachmentDraft, type DraftUploader } from '../../chat/hooks/useAttachmentDraft'
import VoiceRecordButton from '../../chat/components/VoiceRecordButton'
import { PaperclipIcon } from '../../../shared/ui/icons'
import CommentReplyBar from './CommentReplyBar'
import MentionSuggestionList from './MentionSuggestionList'
import IconButton from '../../../shared/ui/IconButton'

const SEARCH_DELAY_MS = 200

// Os anexos do comentário sobem para a rota própria das propostas (a "sala" do rascunho é a proposta).
const uploadForComment: DraftUploader = (_proposalId, file, meta, opts) =>
  uploadCommentAttachment(file, meta, opts)

function commentError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'rate_limited') return 'Calma! Você está comentando rápido demais.'
    if (err.code === 'email_not_verified') return 'Confirme seu e-mail para comentar.'
    if (err.status === 400 && err.message === 'invalid reply') {
      return 'O comentário que você respondia não existe mais.'
    }
    if (err.status === 400) return sendErrorMessage(err.status, err.message)
  }
  return err instanceof Error && err.message ? err.message : 'Não foi possível comentar.'
}

/**
 * Caixa de comentário com autocomplete do "@", resposta a outro comentário e
 * anexos (clipe, colar, arrastar e gravar áudio), como o campo do chat do
 * servidor. Como a proposta é global (não de um servidor), as pessoas vêm da
 * busca de usuários; as escolhidas ficam guardadas (nick → id) para o backend
 * avisar quem foi marcado.
 */
function CommentComposer({
  proposalId,
  replyingTo,
  onCancelReply
}: {
  proposalId: string
  replyingTo: ProposalComment | null
  onCancelReply: () => void
}): React.JSX.Element {
  const addComment = useProposalStore((s) => s.addComment)
  const meUsername = useAuthStore((s) => s.user?.username)
  const [text, setText] = useState('')
  const [caret, setCaret] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendingVoice, setSendingVoice] = useState(false)
  const [overDrop, setOverDrop] = useState(false)
  const [found, setFound] = useState<PublicUser[]>([])
  const [highlight, setHighlight] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const picked = useRef(new Map<string, string>())
  const input = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const { drafts, addFiles, remove, clear } = useAttachmentDraft(proposalId, uploadForComment, 'media')
  const attachmentState = draftStatus(drafts)

  const query = useMemo(() => mentionQuery(text, caret), [text, caret])
  const term = query?.query ?? ''

  // Escolher "Responder" leva o cursor para o campo.
  const replyId = replyingTo?.id
  useEffect(() => {
    if (replyId) input.current?.focus()
  }, [replyId])

  // Busca com atraso: um pedido por pausa na digitação, não por tecla.
  useEffect(() => {
    if (!term) return
    let cancelled = false
    const timer = setTimeout(() => {
      searchUsers(term)
        .then((users) => {
          if (!cancelled) setFound(users)
        })
        .catch(() => {
          if (!cancelled) setFound([])
        })
    }, SEARCH_DELAY_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [term])

  const suggestions = useMemo(() => {
    if (!query || dismissed) return []
    return mentionSuggestions(term, found, false, { exclude: meUsername }).items.flatMap((m) =>
      m.kind === 'user' ? [m] : []
    )
  }, [query, dismissed, term, found, meUsername])

  const pick = (username: string): void => {
    if (!query) return
    const user = found.find((u) => u.username === username)
    if (user) picked.current.set(user.username, user.id)
    const next = applyMention(text, query.start, caret, username)
    setText(next.text)
    setCaret(next.caret)
    setFound([])
    requestAnimationFrame(() => {
      input.current?.focus()
      input.current?.setSelectionRange(next.caret, next.caret)
    })
  }

  const submittable = canSubmit(text, drafts)

  const send = async (): Promise<void> => {
    const body = text.trim()
    if (sending || !submittable) return
    setSending(true)
    try {
      await addComment(
        proposalId,
        body,
        mentionIdsIn(body, picked.current),
        replyingTo?.id ?? null,
        attachmentState.readyIds
      )
      setText('')
      setCaret(0)
      picked.current.clear()
      clear()
      onCancelReply()
    } catch (err) {
      showToast.error(commentError(err))
    } finally {
      setSending(false)
    }
  }

  // Gravação de voz: sobe e comenta na hora, como no chat.
  const handleRecorded = async (blob: Blob, durationMs: number): Promise<void> => {
    setSendingVoice(true)
    try {
      const attachment = await uploadCommentAttachment(blob, {
        filename: 'gravacao.webm',
        duration_ms: durationMs
      })
      await addComment(proposalId, '', [], replyingTo?.id ?? null, [attachment.id])
      onCancelReply()
    } catch (err) {
      showToast.error(
        err instanceof ApiError && err.status !== 400
          ? uploadErrorMessage(err.status)
          : commentError(err)
      )
    } finally {
      setSendingVoice(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (suggestions.length > 0) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const step = e.key === 'ArrowDown' ? 1 : -1
        setHighlight((h) => (h + step + suggestions.length) % suggestions.length)
        return
      }
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault()
        pick(suggestions[Math.min(highlight, suggestions.length - 1)].username)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setDismissed(true)
        return
      }
    }
    if (e.key === 'Escape' && replyingTo) {
      e.preventDefault()
      e.stopPropagation()
      onCancelReply()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
    }
  }

  // Colar texto continua normal; só arquivo (ex.: print) vira anexo.
  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>): void => {
    if (e.clipboardData.files.length === 0) return
    e.preventDefault()
    addFiles(Array.from(e.clipboardData.files))
  }

  const hasFiles = (e: React.DragEvent): boolean => e.dataTransfer.types.includes('Files')

  return (
    <div
      className={`relative flex flex-col gap-2 rounded-lg ${overDrop ? 'ring-2 ring-brand/60' : ''}`}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOverDrop(true)
      }}
      onDragLeave={() => setOverDrop(false)}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setOverDrop(false)
        addFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <MentionSuggestionList
        suggestions={suggestions}
        highlight={highlight}
        onPick={pick}
        onHighlight={setHighlight}
      />
      <ComposerAttachments drafts={drafts} onRemove={remove} />
      <CommentReplyBar replyingTo={replyingTo} onCancel={onCancelReply} />
      <textarea
        ref={input}
        value={text}
        maxLength={MAX_COMMENT}
        rows={2}
        aria-label="Escrever comentário"
        placeholder={commentPlaceholder(replyingTo)}
        className="glass-input w-full resize-none rounded-lg px-3 py-2 text-ds-sm text-strong"
        onChange={(e) => {
          setText(e.target.value)
          setCaret(e.target.selectionStart)
          setHighlight(0)
          setDismissed(false)
        }}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
      />
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={ACCEPT_ATTRIBUTE}
        hidden
        onChange={(e) => {
          addFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <IconButton icon={PaperclipIcon} label="Anexar arquivo" onClick={() => fileInput.current?.click()} />
          <VoiceRecordButton key={proposalId} disabled={sendingVoice} onRecorded={handleRecorded} />
          <span className="ml-1 truncate text-ds-xs text-faint">
            {text.length}/{MAX_COMMENT} · Enter envia, Shift+Enter quebra a linha
          </span>
        </div>
        <Button
          type="button"
          className="shrink-0 px-3 py-1 text-ds-xs"
          disabled={sending || !submittable}
          onClick={() => void send()}
        >
          {commentButtonLabel(attachmentState.uploading, sending)}
        </Button>
      </div>
    </div>
  )
}

export default CommentComposer
