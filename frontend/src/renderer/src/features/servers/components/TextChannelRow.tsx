import { useNavigate } from 'react-router-dom'
import type { Channel } from '../api/channels'
import { LockIcon, StarIcon } from '../../../shared/ui/icons'
import { useChannelUnread } from '../hooks/useChannelBadge'
import { channelBadge } from '../lib/channelBadge'
import { textRowClass } from '../lib/channelSidebar'
import { WRAP_NAME } from '../lib/voiceChannelRow'

interface TextChannelRowProps {
  serverId: string
  channel: Channel
  active: boolean
  isPrivate: boolean
  isPrimary: boolean
  onContextMenu?: (e: React.MouseEvent) => void
  /** O "•••" (todo membro abre o menu do canal de texto) e o menu, quando aberto. */
  menuButton?: React.ReactNode
  menu?: React.ReactNode
}

/** Um canal de texto na barra: nome, cadeado/estrela e o selo de não lidas/menções. */
function TextChannelRow({
  serverId,
  channel,
  active,
  isPrivate,
  isPrimary,
  onContextMenu,
  menuButton,
  menu
}: TextChannelRowProps): React.JSX.Element {
  const navigate = useNavigate()
  const { mentions, unread, muted } = useChannelUnread(serverId, channel.id)
  const badge = channelBadge(mentions, unread, muted)
  return (
    <div className="relative">
      <button
        onClick={() => navigate(`/servers/${serverId}/channels/${channel.id}`)}
        onContextMenu={onContextMenu}
        title={channel.name}
        className={textRowClass({
          canOpenMenu: Boolean(menuButton),
          active,
          dim: muted && !active && mentions === 0
        })}
      >
        <span className="flex h-6 shrink-0 items-center text-ds-lg leading-none text-faint">#</span>
        {/* Nome inteiro, quebrando linha; a estrela segue o texto. */}
        <span className={`min-w-0 flex-1 leading-6 ${WRAP_NAME}`}>
          {channel.name}
          {isPrivate && (
            <span title="Canal privado" className="ml-1.5 inline-flex align-[-1px] text-faint">
              <LockIcon className="h-3 w-3" />
              <span className="sr-only">(canal privado)</span>
            </span>
          )}
          {isPrimary && (
            <span
              title="Canal principal: avisos do servidor são enviados aqui"
              className="ml-1.5 inline-flex align-[-1px] text-warning/90"
            >
              <StarIcon className="h-3 w-3" />
              <span className="sr-only">(canal principal)</span>
            </span>
          )}
        </span>
        {badge && (
          <span className="flex h-6 shrink-0 items-center">
            <span
              title={badge.mention ? 'Menções' : undefined}
              className="rounded-full bg-danger px-1.5 py-0.2 text-ds-xxs font-bold text-white"
            >
              {badge.label}
            </span>
          </span>
        )}
      </button>
      {menuButton}
      {menu}
    </div>
  )
}

export default TextChannelRow
