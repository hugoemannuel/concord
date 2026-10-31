import { useNavigate } from 'react-router-dom'
import { CompactActivityLine } from '../../activity/components/ActivityLine'
import type { ConversationOtherUser, ConversationSummary } from '../../chat/api/conversations'
import { conversationRoute, conversationTitle } from '../../chat/lib/conversations'
import { usePresenceStatus } from '../../chat/store/chatStore'
import StyledName from '../../profile/components/StyledName'
import Nameplate from '../../profile/components/Nameplate'
import { useHoverActive } from '../../../shared/hooks/useHoverActive'
import type { NameStyle } from '../../profile/lib/nameStyle'
import { useUserLook } from '../../profile/store/profileStore'
import { useUserMenuStore } from '../../profile/store/userMenuStore'
import Avatar from '../../../shared/ui/Avatar'
import { XIcon } from '../../../shared/ui/icons'
import GroupIcon from './GroupIcon'

const SIDEBAR_BG = 'var(--bg-secondary)'

function DmAvatar({
  userId,
  name,
  avatarUrl,
  decorationUrl,
  active
}: {
  userId: string
  name: string
  avatarUrl?: string | null
  decorationUrl?: string | null
  active: boolean
}): React.JSX.Element {
  const status = usePresenceStatus(userId)
  return (
    <Avatar
      userId={userId}
      name={name}
      avatarUrl={avatarUrl}
      decorationUrl={decorationUrl}
      active={active}
      size={32}
      status={status}
      cutoutColor={SIDEBAR_BG}
    />
  )
}

/** Nome da conversa, já com a troca mais nova (user:update). */
function DmName({
  userId,
  name,
  style
}: {
  userId: string
  name: string
  style?: NameStyle
}): React.JSX.Element {
  return <StyledName name={useUserLook(userId, { name }).name} userId={userId} style={style} />
}

/** A faixa de quem está do outro lado da DM (grupo não tem). */
function DmNameplate({
  other,
  active
}: {
  other: ConversationOtherUser
  active: boolean
}): React.JSX.Element | null {
  const look = useUserLook(other.id, {
    name: other.display_name || other.username,
    nameplateUrl: other.nameplate_url
  })
  return <Nameplate url={look.nameplateUrl} active={active} fade={SIDEBAR_BG} />
}

/** Ícone do grupo, ou o avatar de quem está do outro lado da DM. */
function ConversationLead({
  conv,
  other,
  isGroup,
  active
}: {
  conv: ConversationSummary
  other: ConversationOtherUser | undefined
  isGroup: boolean
  /** A linha está em hover/foco (anima a moldura). */
  active: boolean
}): React.JSX.Element {
  if (isGroup || !other) return <GroupIcon id={conv.id} iconUrl={conv.icon_url} />
  return (
    <DmAvatar
      userId={other.id}
      name={other.display_name || other.username}
      avatarUrl={other.avatar_url}
      decorationUrl={other.avatar_decoration_url}
      active={active}
    />
  )
}

/** Título e a linha de baixo (digitando, quantos membros ou o jogo da pessoa). */
function ConversationText({
  conv,
  other,
  isGroup,
  title,
  active,
  unread,
  typing
}: {
  conv: ConversationSummary
  other: ConversationOtherUser | undefined
  isGroup: boolean
  title: string
  active: boolean
  unread: number
  typing: boolean
}): React.JSX.Element {
  return (
    <div className="relative min-w-0 flex-1">
      <p
        className={`truncate text-ds-md ${
          active || unread > 0
            ? 'font-semibold text-strong'
            : 'font-medium text-muted group-hover:text-normal'
        }`}
      >
        {!isGroup && other ? (
          <DmName
            userId={other.id}
            name={other.display_name || other.username}
            style={other.name_style}
          />
        ) : (
          title
        )}
      </p>
      {typing ? (
        <p className="truncate text-ds-xs italic text-brand">digitando…</p>
      ) : (
        (isGroup && (
          <p className="truncate text-ds-xs font-medium text-faint">
            {(conv.members ?? []).length} membros
          </p>
        )) ||
        (other && (
          <CompactActivityLine userId={other.id} className="text-ds-xs font-medium text-faint" />
        ))
      )}
    </div>
  )
}

/** Contagem de não lidas e o botão de fechar a DM (ou sair do grupo). */
function ConversationTail({
  unread,
  isGroup,
  onClose
}: {
  unread: number
  isGroup: boolean
  onClose: () => void
}): React.JSX.Element {
  return (
    <>
      {unread > 0 && (
        <span className="relative shrink-0 rounded-full bg-danger-strong px-1.5 text-ds-xs font-bold text-white [@media(hover:hover)]:group-hover:hidden">
          {unread > 99 ? '99+' : unread}
        </span>
      )}
      <button
        type="button"
        aria-label={isGroup ? 'Sair do grupo' : 'Fechar DM'}
        title={isGroup ? 'Sair do grupo' : 'Fechar DM'}
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="relative shrink-0 cursor-pointer text-muted hover:text-strong [@media(pointer:coarse)]:-my-2 [@media(pointer:coarse)]:-mr-2 [@media(pointer:coarse)]:p-3 [@media(hover:hover)]:sr-only [@media(hover:hover)]:group-hover:not-sr-only focus-visible:not-sr-only"
      >
        <XIcon className="h-4 w-4" />
      </button>
    </>
  )
}

/** Uma conversa (DM ou grupo) na lista da barra lateral. */
function ConversationRow({
  conv,
  active,
  unread,
  typing,
  meId,
  onClose
}: {
  conv: ConversationSummary
  active: boolean
  unread: number
  /** Alguém digitando nesta conversa (DM ou grupo). */
  typing: boolean
  meId: string | undefined
  onClose: (conv: ConversationSummary) => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const other = conv.other_user
  const isGroup = conv.type === 'group'
  const title = conversationTitle(conv, meId)
  const hover = useHoverActive()

  const onContextMenu = (e: React.MouseEvent): void => {
    if (!other) return
    e.preventDefault()
    useUserMenuStore.getState().open({
      userId: other.id,
      name: other.display_name || other.username,
      username: other.username,
      conversationId: conv.id,
      x: e.clientX,
      y: e.clientY
    })
  }

  return (
    <div
      {...hover.bind}
      role="button"
      tabIndex={0}
      onClick={() => navigate(conversationRoute(conv, meId))}
      onKeyDown={(e) => {
        if (e.key === 'Enter') navigate(conversationRoute(conv, meId))
      }}
      onContextMenu={onContextMenu}
      className={`group relative flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors ${
        active ? 'bg-fg/10' : 'hover:bg-fg/6'
      }`}
    >
      {!isGroup && other && <DmNameplate other={other} active={hover.active} />}
      <ConversationLead conv={conv} other={other} isGroup={isGroup} active={hover.active} />
      <ConversationText
        conv={conv}
        other={other}
        isGroup={isGroup}
        title={title}
        active={active}
        unread={unread}
        typing={typing}
      />
      <ConversationTail unread={unread} isGroup={isGroup} onClose={() => onClose(conv)} />
    </div>
  )
}

export default ConversationRow
