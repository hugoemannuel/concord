import { useEffect, useState } from 'react'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import { ArchiveIcon } from '../../../shared/ui/icons'
import { useAuthStore } from '../../auth/store/authStore'
import { unarchiveWithToast } from '../store/archiveActions'
import { useArchivedProposalStore } from '../store/archivedProposalStore'
import { useProposalStore } from '../store/proposalStore'
import ArchivedProposalCard from './ArchivedProposalCard'
import ArchivedStatus from './ArchivedStatus'
import ProposalDetailModal from './ProposalDetailModal'

const noop = (): void => {}

/** Lista de propostas arquivadas: qualquer pessoa lê; o time tech desarquiva. */
function ArchivedProposals(): React.JSX.Element {
  const { items, hasMore, loading, loadingMore, loaded, error, stale, query, text } =
    useArchivedProposalStore()
  const { fetch, ensureFresh, setText, loadMore } = useArchivedProposalStore.getState()
  const isTech = useProposalStore((s) => s.isTech)
  const meId = useAuthStore((s) => s.user?.id ?? null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const opened = items.find((p) => p.id === openId)

  // Abre já carregando; arquivar/desarquivar em outro cliente relê.
  useEffect(() => {
    void ensureFresh()
  }, [loaded, stale, ensureFresh])

  const unarchive = async (id: string): Promise<void> => {
    setBusyId(id)
    await unarchiveWithToast(id)
    setBusyId(null)
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-primary text-strong">
      <header className="flex shrink-0 flex-col gap-3 border-b border-subtle px-4 py-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <ArchiveIcon className="h-6 w-6 text-brand" />
          <h2 className="text-ds-md font-bold tracking-wide text-strong">Propostas arquivadas</h2>
        </div>
        <div className="sm:ml-auto sm:w-72">
          <Input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Buscar nas arquivadas"
            aria-label="Buscar nas arquivadas"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <ArchivedStatus
          error={error}
          loading={loading}
          empty={loaded && items.length === 0}
          query={query}
          onRetry={() => void fetch(text)}
        />
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((p) => (
            <li key={p.id} className="flex min-w-0">
              <ArchivedProposalCard
                proposal={p}
                canUnarchive={isTech}
                busy={busyId === p.id}
                onOpen={() => setOpenId(p.id)}
                onUnarchive={() => void unarchive(p.id)}
              />
            </li>
          ))}
        </ul>
        {hasMore && (
          <div className="flex justify-center pt-4">
            <Button variant="ghost" loading={loadingMore} onClick={() => void loadMore()}>
              Carregar mais
            </Button>
          </div>
        )}
      </div>

      {opened && (
        <ProposalDetailModal
          proposal={opened}
          now={Date.now()}
          meId={meId}
          isTech={false}
          busy={false}
          onVote={noop}
          onRemoveVote={noop}
          onMove={noop}
          onDelete={noop}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

export default ArchivedProposals
