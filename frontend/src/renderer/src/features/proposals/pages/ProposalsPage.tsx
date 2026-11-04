import { useSearchParams } from 'react-router-dom'
import { ArchiveIcon, DiamondIcon } from '../../../shared/ui/icons'
import ArchivedProposals from '../components/ArchivedProposals'
import { tabForKey, tabFromParam, type BoardTab } from '../lib/archive'
import Proposals from './Proposals'

const TABS: { id: BoardTab; label: string; param: string | null }[] = [
  { id: 'board', label: 'Quadro', param: null },
  { id: 'archived', label: 'Arquivadas', param: 'arquivadas' }
]

/** Abas "Quadro" e "Arquivadas" (a escolha fica na URL: ?aba=arquivadas). */
function ProposalsPage(): React.JSX.Element {
  const [params, setParams] = useSearchParams()
  const tab = tabFromParam(params.get('aba'))

  const select = (next: BoardTab): void => {
    const param = TABS.find((t) => t.id === next)?.param
    setParams(param ? { aba: param } : {}, { replace: true })
    document.getElementById(`proposals-tab-${next}`)?.focus()
  }

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-hidden bg-primary">
      <div
        role="tablist"
        aria-label="Propostas"
        className="flex shrink-0 items-center gap-1 border-b border-subtle px-4"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            id={`proposals-tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="proposals-panel"
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            onKeyDown={(e) => {
              const next = tabForKey(tab, e.key)
              if (!next) return
              e.preventDefault()
              select(next)
            }}
            className={`focus-ring -mb-px flex min-h-11 cursor-pointer items-center gap-1.5 border-b-2 px-3 text-ds-sm font-medium transition-colors ${
              tab === t.id
                ? 'border-brand text-strong'
                : 'border-transparent text-muted hover:text-normal'
            }`}
          >
            {t.id === 'archived' ? <ArchiveIcon size={16} /> : <DiamondIcon size={16} />}
            {t.label}
          </button>
        ))}
      </div>
      <div id="proposals-panel" role="tabpanel" className="min-h-0 flex-1">
        {tab === 'archived' ? <ArchivedProposals /> : <Proposals />}
      </div>
    </div>
  )
}

export default ProposalsPage
