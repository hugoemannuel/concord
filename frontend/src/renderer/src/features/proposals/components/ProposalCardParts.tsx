// Partes do cartão da proposta (ProposalCard): capa, autor, votos e ações.
import type { Proposal, ProposalImage, ProposalStatus } from '../api/proposals'
import { proposalImageSrc, timeLeftLabel, yesPercent } from '../lib/proposals'
import Avatar from '../../../shared/ui/Avatar'
import Button from '../../../shared/ui/Button'
import { ChatBubbleIcon } from '../../../shared/ui/icons'
import ArchiveButton from './ArchiveButton'
import MoveSelect from './MoveSelect'

/** Os controles de dentro do card não abrem o modal. */
export const stopPropagation = (e: React.SyntheticEvent): void => e.stopPropagation()

/** Atributos do card clicável; o clone do arrasto não é interativo. */
export function cardInteraction(
  overlay: boolean,
  title: string,
  onOpen: () => void
): React.HTMLAttributes<HTMLElement> {
  if (overlay) return { 'aria-hidden': true }
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': `Abrir proposta: ${title}`,
    onClick: onOpen,
    onKeyDown: (e) => {
      if (e.target !== e.currentTarget) return
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onOpen()
      }
    }
  }
}

/** Primeira imagem como capa e "+N" das outras. */
export function ProposalCover({ images }: { images: ProposalImage[] }): React.JSX.Element | null {
  const first = images[0]
  if (!first) return null
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-input">
      <img
        src={proposalImageSrc(first.url)}
        alt=""
        loading="lazy"
        draggable={false}
        className="h-full w-full object-cover"
      />
      {images.length > 1 && (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/70 px-1.5 py-0.5 text-ds-xxs font-semibold text-white on-media">
          +{images.length - 1}
        </span>
      )}
    </div>
  )
}

/** Autor, comentários e o tempo que falta para a votação acabar. */
export function ProposalByline({ proposal: p, now }: { proposal: Proposal; now: number }): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-ds-xs text-muted">
      <Avatar userId={p.author_id} name={p.author_name} avatarUrl={p.author_avatar_url} size={20} />
      <span className="min-w-0 truncate">{p.author_name}</span>
      {p.comment_count > 0 && (
        <span
          className="flex shrink-0 items-center gap-1 text-muted"
          title={`${p.comment_count} ${p.comment_count === 1 ? 'comentário' : 'comentários'}`}
        >
          <ChatBubbleIcon size={16} />
          {p.comment_count}
        </span>
      )}
      {p.status === 'voting' && (
        <span className="ml-auto shrink-0 text-brand">{timeLeftLabel(p.voting_ends_at, now)}</span>
      )}
    </div>
  )
}

/** Barra de sim × não; só aparece em votação ou com votos. */
export function ProposalVoteBar({ proposal: p }: { proposal: Proposal }): React.JSX.Element | null {
  const total = p.yes_votes + p.no_votes
  if (p.status !== 'voting' && total === 0) return null
  const percent = yesPercent(p)
  return (
    <div className="flex flex-col gap-1.5">
      <div
        className="flex h-1.5 overflow-hidden rounded-full bg-fg/10"
        role="img"
        aria-label={`${p.yes_votes} sim e ${p.no_votes} não`}
      >
        <div className="bg-success transition-all" style={{ width: `${percent}%` }} />
        <div
          className="bg-danger transition-all"
          style={{ width: total === 0 ? '0%' : `${100 - percent}%` }}
        />
      </div>
      <div className="flex justify-between text-ds-xs text-muted">
        <span>{p.yes_votes} sim</span>
        <span>{p.no_votes} não</span>
      </div>
    </div>
  )
}

/** Sim / Não; votar de novo no mesmo tira o voto. */
export function ProposalVoteButtons({
  myVote,
  busy,
  onVote,
  onRemoveVote
}: {
  myVote: Proposal['my_vote']
  busy: boolean
  onVote: (approve: boolean) => void
  onRemoveVote: () => void
}): React.JSX.Element {
  return (
    <div className="flex gap-2" onClick={stopPropagation}>
      <Button
        variant={myVote === true ? 'success' : 'ghost'}
        className="flex-1"
        disabled={busy}
        aria-pressed={myVote === true}
        onClick={() => (myVote === true ? onRemoveVote() : onVote(true))}
      >
        Sim
      </Button>
      <Button
        variant={myVote === false ? 'danger' : 'ghost'}
        className="flex-1"
        disabled={busy}
        aria-pressed={myVote === false}
        onClick={() => (myVote === false ? onRemoveVote() : onVote(false))}
      >
        Não
      </Button>
    </div>
  )
}

/** Link da issue no GitHub, quando já tem. */
export function ProposalIssueLink({ proposal: p }: { proposal: Proposal }): React.JSX.Element | null {
  if (!p.github_issue_url) return null
  return (
    <a
      href={p.github_issue_url}
      target="_blank"
      rel="noreferrer"
      onClick={stopPropagation}
      className="text-ds-xs font-medium text-brand hover:text-strong hover:underline"
    >
      Issue #{p.github_issue_number} no GitHub
    </a>
  )
}

/** Rodapé do time tech (mover) e de quem pode excluir. */
export function ProposalCardActions({
  proposalId,
  status,
  isTech,
  canArchive,
  canDelete,
  busy,
  onMove,
  onDelete
}: {
  proposalId: string
  status: ProposalStatus
  isTech: boolean
  /** Concluída ou recusada: o time tech pode arquivar. */
  canArchive: boolean
  canDelete: boolean
  busy: boolean
  onMove: (status: ProposalStatus) => void
  onDelete: () => void
}): React.JSX.Element | null {
  if (!isTech && !canDelete) return null
  return (
    <div
      className="flex flex-wrap items-center gap-2 border-t border-subtle pt-2"
      onClick={stopPropagation}
    >
      {isTech && <MoveSelect status={status} disabled={busy} onMove={onMove} />}
      {canArchive && <ArchiveButton id={proposalId} className="ml-auto" />}
      {canDelete && (
        <Button
          variant="ghost"
          className={canArchive ? 'px-3 py-1 text-ds-xs' : 'ml-auto px-3 py-1 text-ds-xs'}
          disabled={busy}
          onClick={onDelete}
        >
          Excluir
        </Button>
      )}
    </div>
  )
}
