import { memo } from 'react'
import { useServerStore } from '../../servers/store/serverStore'
import { roleChipView } from '../lib/roleMentions'

/**
 * Menção de cargo no texto da mensagem: o nome atual do cargo, na cor dele
 * (o chip da pessoa é sempre da cor da marca). Não abre nada ao clicar.
 */
function RoleMentionChip({ roleId, text }: { roleId: string; text: string }): React.JSX.Element {
  const role = useServerStore((s) => s.roles.find((r) => r.id === roleId))
  const { label, color } = roleChipView(role, text)
  return (
    <span
      className="rounded bg-fg/10 px-0.5 font-medium text-strong"
      style={
        color
          ? { color, backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` }
          : undefined
      }
    >
      {label}
    </span>
  )
}

export default memo(RoleMentionChip)
