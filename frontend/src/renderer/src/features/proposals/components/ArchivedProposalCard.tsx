import type { Proposal } from '../api/proposals'
import Button from '../../../shared/ui/Button'
import { ChatBubbleIcon, UnarchiveIcon } from '../../../shared/ui/icons'
import { archivedOnLabel, archiveStatusLabel } from '../lib/archive'

/**
 * Cartão da lista de arquivadas: leitura para todos (abre o detalhe); o time tech
 * ainda vê "Desarquivar". O desfecho (sim × não) fica no cartão.
 */
function ArchivedProposalCard({
  proposal: p,
  canUnarchive,
  busy,
  onOpen,
  onUnarchive
}: {
  proposal: Proposal
  canUnarchive: boolean
  busy: boolean
  onOpen: () => void
  onUnarchive: () => void
}): React.JSX.Element {
  return (
    <article className="flex min-w-0 flex-col rounded-lg border border-subtle bg-fg/3 transition-colors hover:bg-fg/5">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Abrir proposta arquivada: ${p.title}`}
        className="focus-ring flex min-w-0 flex-1 cursor-pointer flex-col gap-2 rounded-lg p-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-fg/10 px-2 py-0.5 text-ds-xxs font-medium text-secondary">
            {archiveStatusLabel(p.status)}
          </span>
          <span className="min-w-0 truncate text-ds-xs text-muted">{p.author_name}</span>
        </span>
        <span className="wrap-break-word text-ds-sm font-semibold leading-snug text-strong">
          {p.title}
        </span>
        {p.description && (
          <span className="line-clamp-3 whitespace-pre-wrap wrap-break-word text-ds-xs text-muted">
            {p.description}
          </span>
        )}
        <span className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-ds-xs text-muted">
          <span>{archivedOnLabel(p.archived_at)}</span>
          <span>
            {p.yes_votes} sim · {p.no_votes} não
          </span>
          {p.comment_count > 0 && (
            <span className="flex items-center gap-1" title={`${p.comment_count} comentários`}>
              <ChatBubbleIcon size={16} />
              {p.comment_count}
            </span>
          )}
        </span>
      </button>
      {canUnarchive && (
        <div className="border-t border-subtle p-2">
          <Button
            variant="ghost"
            size="sm"
            icon={UnarchiveIcon}
            className="w-full"
            loading={busy}
            onClick={onUnarchive}
          >
            Desarquivar
          </Button>
        </div>
      )}
    </article>
  )
}

export default ArchivedProposalCard
