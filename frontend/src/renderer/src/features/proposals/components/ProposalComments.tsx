import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../../../shared/api/client'
import type { ProposalComment } from '../api/proposals'
import { commentSaveDisabled } from '../lib/commentKeys'
import { hasReacted } from '../lib/proposals'
import { useProposalStore } from '../store/proposalStore'
import { showToast } from '../../../shared/store/toastStore'
import Avatar from '../../../shared/ui/Avatar'
import CommentActions from './CommentActions'
import CommentEditForm from './CommentEditForm'
import { CommentBody, CommentMeta, CommentReply } from './CommentParts'
import EmotePickerPopover from '../../chat/components/EmotePickerPopover'
import { useReactionPicker } from '../../chat/hooks/useReactionPicker'
import ReactionChips from '../../chat/components/ReactionChips'
import CommentComposer from './CommentComposer'
import { CommentListSkeleton } from '../../../shared/ui/skeleton/layouts'

const NO_COMMENTS: ProposalComment[] = []

/** Quanto tempo o comentário fica destacado depois de "ir até a resposta". */
const HIGHLIGHT_MS = 1800

function reactError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'too_many_reactions') return 'Esse comentário já tem emojis demais.'
    if (err.code === 'email_not_verified') return 'Confirme seu e-mail para reagir.'
  }
  return err instanceof Error && err.message ? err.message : 'Não foi possível reagir.'
}

function CommentRow({
  comment,
  proposalId,
  meId,
  isTech,
  highlighted,
  onReply,
  onJump
}: {
  comment: ProposalComment
  proposalId: string
  meId: string | null
  isTech: boolean
  highlighted: boolean
  onReply: () => void
  onJump: (commentId: string) => void
}): React.JSX.Element {
  const editComment = useProposalStore((s) => s.editComment)
  const removeComment = useProposalStore((s) => s.removeComment)
  const reactToComment = useProposalStore((s) => s.reactToComment)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(comment.body)
  const [busy, setBusy] = useState(false)
  const [hover, setHover] = useState(false)
  const picker = useReactionPicker()

  const hasAttachments = comment.attachments.length > 0

  const save = async (): Promise<void> => {
    const body = draft.trim()
    // Só quem tem anexo pode ficar sem texto.
    if ((!body && !hasAttachments) || busy) return
    if (body === comment.body) {
      setEditing(false)
      return
    }
    setBusy(true)
    try {
      await editComment(proposalId, comment.id, body)
      setEditing(false)
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Não foi possível editar o comentário.')
    } finally {
      setBusy(false)
    }
  }

  const remove = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await removeComment(proposalId, comment.id)
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Não foi possível apagar o comentário.')
      setBusy(false)
    }
  }

  const react = async (emoji: string): Promise<void> => {
    try {
      await reactToComment(proposalId, comment.id, emoji, !hasReacted(comment, meId, emoji))
    } catch (err) {
      showToast.error(reactError(err))
    }
  }

  return (
    <li
      id={`comment-${comment.id}`}
      data-comment
      className={`group relative flex flex-col gap-1 rounded-md px-2 py-1.5 transition-colors ${
        highlighted ? 'bg-brand/20 ring-1 ring-brand/50' : 'hover:bg-fg/3'
      }`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <CommentReply comment={comment} onJump={onJump} />
      <div className="flex gap-2.5">
        <Avatar
          userId={comment.author_id}
          name={comment.author_name}
          avatarUrl={comment.author_avatar_url}
          size={32}
        />
        <div className="min-w-0 flex-1">
          <CommentMeta comment={comment} />
          <CommentBody
            comment={comment}
            editing={editing}
            editForm={
              <CommentEditForm
                draft={draft}
                onDraft={setDraft}
                saveDisabled={commentSaveDisabled(draft, hasAttachments, busy)}
                onSave={() => void save()}
                onCancel={() => setEditing(false)}
              />
            }
          />
          <ReactionChips
            reactions={comment.reactions}
            meId={meId ?? undefined}
            canReact
            pickerAnchor={picker.anchor}
            onReact={(emoji) => void react(emoji)}
            onOpenPicker={picker.toggle}
          />
        </div>
      </div>

      {(hover || picker.open) && !editing && (
        <CommentActions
          comment={comment}
          meId={meId}
          isTech={isTech}
          onReact={(emoji) => void react(emoji)}
          onTogglePicker={() => picker.toggle()}
          onReply={onReply}
          onEdit={() => {
            setDraft(comment.body)
            setEditing(true)
          }}
          onDelete={() => void remove()}
        />
      )}
      {picker.open && (
        <EmotePickerPopover
          anchor={picker.anchor}
          onSelect={(emoji) => void react(emoji)}
          onClose={picker.close}
        />
      )}
    </li>
  )
}

/** Conversa do card: lista (ao vivo pelo tempo real) e caixa para comentar, como o chat do servidor. */
function ProposalComments({
  proposalId,
  meId,
  isTech
}: {
  proposalId: string
  meId: string | null
  isTech: boolean
}): React.JSX.Element {
  const comments = useProposalStore((s) => s.commentsByProposal[proposalId]) ?? NO_COMMENTS
  const loaded = useProposalStore((s) => s.commentsByProposal[proposalId] != null)
  const loadComments = useProposalStore((s) => s.loadComments)
  const [failedFor, setFailedFor] = useState<string | null>(null)
  const failed = failedFor === proposalId
  const [replyToId, setReplyToId] = useState<string | null>(null)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Se o comentário respondido sumiu (apagado por alguém), a resposta é cancelada.
  const replyingTo = comments.find((c) => c.id === replyToId) ?? null

  useEffect(() => {
    loadComments(proposalId).catch(() => setFailedFor(proposalId))
  }, [proposalId, loadComments])

  useEffect(
    () => () => {
      if (highlightTimer.current) clearTimeout(highlightTimer.current)
    },
    []
  )

  const jumpTo = (commentId: string): void => {
    const el = document.getElementById(`comment-${commentId}`)
    if (!el) {
      showToast.info('Esse comentário não está mais aqui.')
      return
    }
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    setHighlightId(commentId)
    if (highlightTimer.current) clearTimeout(highlightTimer.current)
    highlightTimer.current = setTimeout(() => setHighlightId(null), HIGHLIGHT_MS)
  }

  return (
    <section aria-label="Comentários" className="flex flex-col gap-3">
      <h3 className="text-ds-sm font-semibold text-strong">
        Comentários{loaded && comments.length > 0 ? ` (${comments.length})` : ''}
      </h3>
      {!loaded ? (
        failed ? (
          <p className="text-ds-xs text-muted">Não foi possível carregar os comentários.</p>
        ) : (
          <CommentListSkeleton />
        )
      ) : comments.length === 0 ? (
        <p className="text-ds-xs text-faint">Ninguém comentou ainda. Comece a conversa!</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              proposalId={proposalId}
              meId={meId}
              isTech={isTech}
              highlighted={highlightId === c.id}
              onReply={() => setReplyToId(c.id)}
              onJump={jumpTo}
            />
          ))}
        </ul>
      )}
      <CommentComposer
        proposalId={proposalId}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyToId(null)}
      />
    </section>
  )
}

export default ProposalComments
