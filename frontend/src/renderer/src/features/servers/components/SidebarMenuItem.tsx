const TONES = {
  normal: 'text-normal hover:bg-fg/10',
  brand: 'text-brand hover:bg-brand/20',
  danger: 'text-danger hover:bg-danger/15'
} as const

export type SidebarMenuTone = keyof typeof TONES

interface SidebarMenuItemProps {
  label: string
  icon?: React.ReactNode
  tone?: SidebarMenuTone
  /** Dentro de um `role="menu"`: "menuitem". */
  role?: 'menuitem'
  onClick: () => void
}

/** Um item dos menus da barra de canais (do servidor e do canal). */
function SidebarMenuItem({
  label,
  icon,
  tone = 'normal',
  role,
  onClick
}: SidebarMenuItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      role={role}
      onClick={onClick}
      className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-ds-sm font-medium cursor-pointer focus-ring ${TONES[tone]}`}
    >
      <span>{label}</span>
      {icon}
    </button>
  )
}

export const SIDEBAR_MENU_ITEM_CLASS =
  'rounded-lg px-2.5 py-2 text-left text-ds-sm font-medium cursor-pointer focus-ring text-normal hover:bg-fg/10'

export default SidebarMenuItem
