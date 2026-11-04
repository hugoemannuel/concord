// Partes do modal de detalhe da proposta (ProposalDetailModal).
import type { Proposal, ProposalImage, ProposalStatus } from '../api/proposals'
import {
  BOARD_COLUMNS,
  proposalImageSrc,
  REJECTED_COLUMN,
  timeLeftLabel,
  yesPercent
} from '../lib/proposals'
import Avatar from '../../../shared/ui/Avatar'
import Button from '../../../shared/ui/Button'
import MoveSelect from './MoveSelect'

const columnTitle = (status: ProposalStatus): string =>
  [...BOARD_COLUMNS, REJECTED_COLUMN].find((c) => c.status === status)?.title ?? status

/** Autor, coluna atual, tempo que falta e se foi editada. */
export function DetailByline({ proposal: p, now }: { proposal: Proposal; now: number }): React.JSX.Element {
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
      <Avatar userId={p.author_id} name={p.author_name} avatarUrl={p.author_avatar_url} size={24} />
      <span className="font-medium text-gray-200">{p.author_name}</span>
      <span className="rounded-full bg-violet-500/15 px-2.5 py-0.5 text-[11px] font-medium text-violet-200 ring-1 ring-violet-400/30">
        {columnTitle(p.status)}
      </span>
      {p.status === 'voting' && (
        <span className="text-violet-300">{timeLeftLabel(p.voting_ends_at, now)}</span>
      )}
      {p.edited_at && <span className="text-gray-500">(editada)</span>}
    </div>
  )
}

/** Imagens da proposta (a primeira grande); clicar amplia. */
export function DetailImages({
  images,
  onZoom
}: {
  images: ProposalImage[]
  onZoom: (src: string) => void
}): React.JSX.Element | null {
  if (images.length === 0) return null
  return (
    <ul className="grid grid-cols-3 gap-2">
      {images.map((img, i) => (
        <li key={img.id} className={i === 0 ? 'col-span-3' : undefined}>
          <button
            type="button"
            onClick={() => onZoom(proposalImageSrc(img.url))}
            aria-label={`Ampliar imagem ${i + 1}`}
            className={`block w-full cursor-zoom-in overflow-hidden rounded-xl border border-white/10 bg-black/40 transition-colors hover:border-white/25 ${
              i === 0 ? 'aspect-video' : 'aspect-square'
            }`}
          >
            <img
              src={proposalImageSrc(img.url)}
              alt={`Imagem ${i + 1} da proposta`}
              loading="lazy"
              draggable={false}
              className={`h-full w-full ${i === 0 ? 'object-contain' : 'object-cover'}`}
            />
          </button>
        </li>
      ))}
    </ul>
  )
}

/** Barra de sim × não; só aparece em votação ou com votos. */
export function DetailVotes({ proposal: p }: { proposal: Proposal }): React.JSX.Element | null {
  const total = p.yes_votes + p.no_votes
  if (p.status !== 'voting' && total === 0) return null
  const percent = yesPercent(p)
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-subtle bg-fg/3 p-3">
      <div
        className="flex h-2 overflow-hidden rounded-full bg-fg/10"
        role="img"
        aria-label={`${p.yes_votes} sim e ${p.no_votes} não`}
      >
        <div className="bg-discord-green transition-all" style={{ width: `${percent}%` }} />
        <div
          className="bg-discord-dnd transition-all"
          style={{ width: total === 0 ? '0%' : `${100 - percent}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-400">
        <span>{p.yes_votes} sim</span>
        <span>{p.no_votes} não</span>
      </div>
    </div>
  )
}

/** Sim / Não; votar de novo no mesmo tira o voto. */
export function DetailVoteButtons({
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
    <div className="flex gap-2">
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

/** Rodapé: link da issue, mover (time tech), editar e excluir. */
export function DetailActions({
  proposal: p,
  isTech,
  canEdit,
  canDelete,
  busy,
  onMove,
  onEdit,
  onDelete
}: {
  proposal: Proposal
  isTech: boolean
  canEdit: boolean
  canDelete: boolean
  busy: boolean
  onMove: (status: ProposalStatus) => void
  onEdit: () => void
  onDelete: () => void
}): React.JSX.Element | null {
  if (!p.github_issue_url && !canEdit && !canDelete && !isTech) return null
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
      {p.github_issue_url && (
        <a
          href={p.github_issue_url}
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-violet-300 hover:text-violet-200 hover:underline"
        >
          Issue #{p.github_issue_number} no GitHub
        </a>
      )}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {isTech && <MoveSelect status={p.status} disabled={busy} onMove={onMove} />}
        {canEdit && (
          <Button variant="secondary" className="px-3 py-1 text-xs" disabled={busy} onClick={onEdit}>
            Editar
          </Button>
        )}
        {canDelete && (
          <Button variant="ghost" className="px-3 py-1 text-xs" disabled={busy} onClick={onDelete}>
            Excluir
          </Button>
        )}
      </div>
    </div>
  )
}
