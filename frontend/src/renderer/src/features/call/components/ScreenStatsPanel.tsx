import { HOVER_REVEAL } from '../lib/hoverReveal'
import { useScreenStats } from '../hooks/useScreenStats'
import { useScreenStatsStore } from '../store/screenStatsStore'
import { XIcon } from '../../../shared/ui/icons'
import { closesStatsPanel, type LiveOwner } from '../lib/liveVideo'
import type { ScreenStatsView } from '../lib/screenStats'
import IconButton from '../../../shared/ui/IconButton'

/** Gráfico de barras (estatísticas). */
function StatsIcon({ className = '' }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      className={className}
      aria-hidden="true"
    >
      <path strokeLinecap="round" d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />
    </svg>
  )
}

/** Clique e arrasto aqui não abrem o foco nem arrastam a miniatura. */
const keepInside = {
  onClick: (e: React.SyntheticEvent) => e.stopPropagation(),
  onDoubleClick: (e: React.SyntheticEvent) => e.stopPropagation(),
  onPointerDown: (e: React.SyntheticEvent) => e.stopPropagation()
}

export function ScreenStatsCard({
  view,
  local,
  onClose
}: {
  view: ScreenStatsView | null
  local: boolean
  onClose: () => void
}): React.JSX.Element {
  return (
    <div
      role="dialog"
      aria-label="Estatísticas da transmissão"
      className="on-media absolute right-2 top-11 z-20 max-h-[calc(100%-3.25rem)] w-60 max-w-[calc(100%-1rem)] overflow-y-auto rounded-lg bg-black/80 p-2.5 text-ds-xs text-strong shadow-xl backdrop-blur-sm"
      {...keepInside}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="font-bold text-white">{local ? 'Sua transmissão' : 'Recebendo'}</p>
        <IconButton icon={XIcon} label="Fechar estatísticas" onClick={onClose} />
      </div>
      {view === null && <p className="text-secondary">Medindo…</p>}
      {view?.status && <p className="mb-1.5 font-semibold text-warning">{view.status}</p>}
      {view && view.rows.length > 0 && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5">
          {view.rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-muted">{row.label}</dt>
              <dd className="truncate text-right font-medium tabular-nums" title={row.value}>
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {view?.note && <p className="mt-1.5 text-secondary">{view.note}</p>}
    </div>
  )
}

function LiveScreenStats({ owner }: { owner: LiveOwner }): React.JSX.Element {
  const view = useScreenStats(owner.userId, owner.local)
  const close = useScreenStatsStore((s) => s.close)
  return <ScreenStatsCard view={view} local={owner.local} onClose={close} />
}

/** Ícone no canto da live; o painel (e a coleta do getStats) só existe aberto. */
export function StatsCorner({
  owner,
  open,
  onToggle,
  onClose
}: {
  owner: LiveOwner
  open: boolean
  onToggle: () => void
  onClose: () => void
}): React.JSX.Element {
  return (
    <div
      className="contents"
      onKeyDown={(e) => {
        if (!open || !closesStatsPanel(e.key)) return
        e.stopPropagation()
        onClose()
      }}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
        onDoubleClick={keepInside.onDoubleClick}
        onPointerDown={keepInside.onPointerDown}
        aria-label="Estatísticas da transmissão"
        aria-expanded={open}
        title="Estatísticas da transmissão"
        className={`on-media absolute right-2 top-10 z-20 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full backdrop-blur-sm transition-colors ${
          open ? '' : HOVER_REVEAL
        } ${
          open
            ? 'bg-brand text-white'
            : 'bg-black/60 text-normal hover:bg-black/80 hover:text-white'
        }`}
      >
        <StatsIcon className="h-3.5 w-3.5" />
      </button>
      {open && <LiveScreenStats owner={owner} />}
    </div>
  )
}

export default function ScreenStatsCorner({ owner }: { owner: LiveOwner }): React.JSX.Element {
  const open = useScreenStatsStore((s) => s.openFor === owner.userId)
  const toggle = useScreenStatsStore((s) => s.toggle)
  const close = useScreenStatsStore((s) => s.close)
  return (
    <StatsCorner owner={owner} open={open} onToggle={() => toggle(owner.userId)} onClose={close} />
  )
}
