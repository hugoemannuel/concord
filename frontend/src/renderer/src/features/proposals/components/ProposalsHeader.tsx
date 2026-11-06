import { useNavigate } from 'react-router-dom'
import Button from '../../../shared/ui/Button'
import { ChangelogIcon, DiamondIcon } from '../../../shared/ui/icons'
import GithubUsernameButton from './GithubUsernameButton'

/** Topo do quadro de propostas: filtro de recusadas, novidades e nova proposta. */
function ProposalsHeader({
  isTech,
  showRejected,
  rejectedCount,
  onToggleRejected,
  onCreate
}: {
  isTech: boolean
  showRejected: boolean
  rejectedCount: number
  onToggleRejected: () => void
  onCreate: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-subtle px-4">
      <DiamondIcon className="h-6 w-6 text-violet-400" />
      <span className="text-base font-bold tracking-wide text-strong">Propostas</span>
      <div className="flex items-center gap-2">
        {isTech && <GithubUsernameButton />}
        <Button variant="ghost" onClick={onToggleRejected}>
          {showRejected ? 'Ocultar recusadas' : `Ver recusadas (${rejectedCount})`}
        </Button>
        <Button
          variant="ghost"
          className="inline-flex items-center"
          onClick={() => navigate('/changelog')}
        >
          <ChangelogIcon className="mr-1.5 h-4 w-4" />
          Novidades
        </Button>
        <Button onClick={onCreate}>Nova proposta</Button>
      </div>
    </header>
  )
}

export default ProposalsHeader
