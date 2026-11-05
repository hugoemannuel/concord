import { badgeText } from '../lib/serverRailBadge'
import { railDmLabel } from '../lib/railDms'

interface RailDmItemProps {
  /** Nome da pessoa (ou do grupo) que mandou. */
  name: string
  unread: number
  onOpen: () => void
  /** O avatar (DM) ou o ícone do grupo, em 48 px. */
  children: React.ReactNode
}

/** Uma DM não lida no trilho: o avatar de quem mandou e quantas mensagens são. */
function RailDmItem({ name, unread, onOpen, children }: RailDmItemProps): React.JSX.Element {
  const label = railDmLabel(name, unread)
  return (
    <div className="group/dm relative flex items-center justify-center">
      <span className="absolute -left-3.5 h-0 w-2 rounded-r-full bg-[var(--text-strong)] transition-all duration-200 group-hover/dm:h-5" />
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        title={label}
        className="group relative flex h-12 w-12 cursor-pointer items-center justify-center overflow-hidden rounded-[50%] transition-all duration-200 hover:rounded-xl"
      >
        {children}
      </button>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-ds-xxs font-bold text-white shadow-md"
      >
        {badgeText(unread)}
      </span>
    </div>
  )
}

export default RailDmItem
