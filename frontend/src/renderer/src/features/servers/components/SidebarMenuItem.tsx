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
  /** Item de ligar e desligar: diz o estado para o leitor de tela. */
  checked?: boolean
  /** Dentro de um `role="menu"`: "menuitem". */
  role?: 'menuitem'
  onClick: () => void
}

/** Um item dos menus da barra de canais (do servidor e do canal). */
function SidebarMenuItem({
  label,
  icon,
  tone = 'normal',
  checked,
  role,
  onClick
}: SidebarMenuItemProps): React.JSX.Element {
  return (
    <button
      type="button"
      role={role}
      {...(checked === undefined ? {} : { role: 'menuitemcheckbox', 'aria-checked': checked })}
      onClick={onClick}
      className={`focus-ring flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-ds-sm font-medium cursor-pointer ${TONES[tone]}`}
    >
      <span>{label}</span>
      {icon}
    </button>
  )
}

export const SIDEBAR_MENU_ITEM_CLASS =
  'rounded-lg px-2.5 py-2 text-left text-ds-sm font-medium cursor-pointer focus-ring text-normal hover:bg-fg/10'

export default SidebarMenuItem
