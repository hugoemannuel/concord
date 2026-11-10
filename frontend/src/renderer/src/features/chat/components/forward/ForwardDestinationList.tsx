import Avatar from '../../../../shared/ui/Avatar'
import ServerIcon from '../../../../shared/ui/ServerIcon'
import Spinner from '../../../../shared/ui/Spinner'
import { CheckIcon, FriendsIcon } from '../../../../shared/ui/icons'
import type { ForwardDestination } from '../../lib/forward'

function DestinationIcon({ item }: { item: ForwardDestination }): React.JSX.Element {
  if (item.avatar) {
    return <Avatar userId={item.avatar.userId} name={item.label} avatarUrl={item.avatar.url} size={32} />
  }
  if (item.kind === 'channel') return <ServerIcon name={item.hint} iconUrl={item.iconUrl} size="md" />
  return (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-fg/10 text-secondary">
      <FriendsIcon size={16} />
    </span>
  )
}

function DestinationRow({
  item,
  selected,
  onSelect
}: {
  item: ForwardDestination
  selected: boolean
  onSelect: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`focus-ring-inset flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-fg/5 ${selected ? 'bg-fg/10' : ''}`}
    >
      <DestinationIcon item={item} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-ds-sm font-medium text-strong">{item.label}</span>
        {item.hint && <span className="block truncate text-ds-xs text-muted">{item.hint}</span>}
      </span>
      {selected && <CheckIcon size={16} className="shrink-0 text-brand" />}
    </button>
  )
}

/** Lista de destinos (conversas e canais); um escolhido por vez. */
export default function ForwardDestinationList({
  items,
  selectedKey,
  loading,
  onSelect
}: {
  items: ForwardDestination[]
  selectedKey?: string
  /** Os canais ainda estão chegando. */
  loading: boolean
  onSelect: (item: ForwardDestination) => void
}): React.JSX.Element {
  return (
    <div
      role="group"
      aria-label="Destinos"
      className="max-h-[40dvh] min-h-24 overflow-y-auto overscroll-contain rounded-lg border border-subtle p-1"
    >
      {items.map((item) => (
        <DestinationRow
          key={item.key}
          item={item}
          selected={item.key === selectedKey}
          onSelect={() => onSelect(item)}
        />
      ))}
      {loading && (
        <div className="flex justify-center py-3 text-muted">
          <Spinner />
        </div>
      )}
      {!loading && items.length === 0 && (
        <p className="py-6 text-center text-ds-sm text-muted">Nada encontrado.</p>
      )}
    </div>
  )
}
