import { FriendsIcon, SearchIcon } from '../../../shared/ui/icons'
import type { FriendsTab } from '../../../shared/store/uiStore'
import MobileNavButton from '../../navigation/components/MobileNavButton'
import { addTabClass, tabBadge, tabClass, type TabCounts } from '../lib/friendsTabs'

const TABS: { id: Exclude<FriendsTab, 'add'>; label: string }[] = [
  { id: 'online', label: 'Online' },
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendente' },
  { id: 'blocked', label: 'Bloqueado' }
]

function TabButton({
  label,
  active,
  badge,
  onClick
}: {
  label: string
  active: boolean
  badge: number
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-0.5 text-ds-md font-medium transition-colors max-md:min-h-9 ${tabClass(active)}`}
    >
      {label}
      {badge > 0 && (
        <span className="rounded-full bg-danger-strong px-1.5 text-ds-xs font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  )
}

/** Cabeçalho da tela de Amigos: título e abas (rolam na horizontal em tela estreita). */
export function FriendsHeader({
  tab,
  onTab,
  counts
}: {
  tab: FriendsTab
  onTab: (tab: FriendsTab) => void
  counts: TabCounts
}): React.JSX.Element {
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-subtle px-4 sm:gap-4">
      <MobileNavButton />
      <div className="flex shrink-0 items-center gap-2 font-semibold text-strong max-sm:sr-only">
        <FriendsIcon className="h-5 w-5 text-muted" />
        Amigos
      </div>
      <span className="h-6 w-px shrink-0 bg-fg/10 max-sm:hidden" />
      <nav className="flex min-w-0 items-center gap-2 overflow-x-auto">
        {TABS.map((t) => (
          <TabButton
            key={t.id}
            label={t.label}
            active={tab === t.id}
            badge={tabBadge(t.id, counts)}
            onClick={() => onTab(t.id)}
          />
        ))}
        <button
          type="button"
          onClick={() => onTab('add')}
          className={`shrink-0 cursor-pointer rounded-md px-2.5 py-0.5 text-ds-md font-medium transition-colors ${addTabClass(tab === 'add')}`}
        >
          Adicionar amigo
        </button>
      </nav>
    </header>
  )
}

export function SearchBox({
  value,
  onChange
}: {
  value: string
  onChange: (v: string) => void
}): React.JSX.Element {
  return (
    <label className="flex items-center gap-2 rounded-md border border-black/40 bg-floating px-3 py-1.5 focus-within:border-brand">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar"
        className="min-w-0 flex-1 bg-transparent text-ds-md text-strong outline-none placeholder:text-faint"
      />
      <SearchIcon className="h-4 w-4 text-faint" />
    </label>
  )
}
