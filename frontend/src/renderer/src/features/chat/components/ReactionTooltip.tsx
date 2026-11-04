import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { useChatStore } from '../store/chatStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { useProfileStore } from '../../profile/store/profileStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useServerNicknames } from '../../servers/hooks/useServerNames'
import { resolveReactionPeople } from '../lib/reactionPeople'
import { insideElement } from '../lib/insideElement'
import Avatar from '../../../shared/ui/Avatar'
import ReactionEmoji, { ReactionOrigin, useReactionLabel } from '../../emojis/components/ReactionEmoji'

const WIDTH = 240
const GAP = 6
const MARGIN = 8
/** Abaixo disso o popover vira para baixo do chip (ou fica bem baixinho). */
const FLIP_ABOVE = 170
const MIN_HEIGHT = 72

/**
 * "Quem reagiu" ao passar o mouse num chip de reação. Fica num portal com
 * posição fixa para não ser cortado pelo scroll do chat; abre acima do chip e
 * vira para baixo quando não há espaço.
 */
function ReactionTooltip({
  emoji,
  userIds,
  anchor,
  serverId,
  meId,
  onClose,
  onMouseEnter,
  onMouseLeave
}: {
  emoji: string
  userIds: string[]
  /** Chip que abriu o popover. */
  anchor: HTMLElement
  /** Canal de servidor: nomes com o apelido de lá. */
  serverId?: string
  meId?: string
  onClose: () => void
  /** Entrou no popover: cancela o fechamento por saída do chip. */
  onMouseEnter: () => void
  /** Saiu do popover: agenda o fechamento. */
  onMouseLeave: () => void
}): React.JSX.Element {
  const profiles = useProfileStore((s) => s.profiles)
  const fetchProfile = useProfileStore((s) => s.fetchProfile)
  const members = useServerStore((s) => s.currentMembers)
  const friends = useFriendStore((s) => s.friends)
  const conversations = useChatStore((s) => s.conversations)
  const me = useAuthStore((s) => s.user)
  const nicknames = useServerNicknames(serverId)
  const label = useReactionLabel(emoji)

  const conversationMembers = useMemo(
    () => conversations.flatMap((conversation) => conversation.members ?? []),
    [conversations]
  )

  const { people, missing } = useMemo(
    () =>
      resolveReactionPeople(userIds, {
        profiles,
        members,
        nicknames,
        friends,
        conversationMembers,
        me
      }),
    [userIds, profiles, members, nicknames, friends, conversationMembers, me]
  )

  // Sem fonte carregada (ex.: reação num comentário de proposta): busca o
  // perfil só agora, com o popover aberto. O store deduplica e guarda 60 s.
  const missingKey = missing.join(',')
  useEffect(() => {
    if (!missingKey) return
    for (const id of missingKey.split(',')) void fetchProfile(id)
  }, [missingKey, fetchProfile])

  // Fecha ao rolar a lista (o chip sai de baixo do popover) ou ao redimensionar.
  // A rolagem da própria lista de pessoas não fecha.
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onScroll = (e: Event): void => {
      if (!insideElement(ref.current, e.target)) onClose()
    }
    const close = (): void => onClose()
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  // Posição lida uma vez: qualquer rolagem fecha o popover.
  const [rect] = useState(() => anchor.getBoundingClientRect())
  const placeBelow = rect.top < FLIP_ABOVE && window.innerHeight - rect.bottom > rect.top
  const center = rect.left + rect.width / 2 - WIDTH / 2
  const maxLeft = Math.max(MARGIN, window.innerWidth - WIDTH - MARGIN)
  const left = Math.min(Math.max(MARGIN, center), maxLeft)
  const available = placeBelow
    ? window.innerHeight - rect.bottom - GAP - MARGIN
    : rect.top - GAP - MARGIN
  const maxHeight = Math.max(MIN_HEIGHT, available)
  const position = placeBelow
    ? { left, top: rect.bottom + GAP }
    : { left, bottom: window.innerHeight - rect.top + GAP }

  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      aria-label={`Quem reagiu com ${label}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{ ...position, width: WIDTH, maxHeight }}
      className="fixed z-40 flex flex-col rounded-lg border border-subtle bg-floating p-1.5 shadow-2xl shadow-black/60"
    >
      <div className="flex shrink-0 items-center gap-1.5 px-1 pb-1 text-ds-xs text-gray-400">
        <span className="text-sm leading-none">
          <ReactionEmoji emoji={emoji} />
        </span>
        <span>
          {userIds.length} {userIds.length === 1 ? 'reação' : 'reações'}
        </span>
      </div>
      <ReactionOrigin emoji={emoji} />
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {people.map((person) => (
          <li key={person.id} className="flex items-center gap-2 px-1 py-1">
            <Avatar userId={person.id} name={person.name} avatarUrl={person.avatarUrl} size={20} />
            <span className="min-w-0 truncate text-ds-sm text-gray-200">{person.name}</span>
            {person.id === meId && (
              <span className="shrink-0 text-ds-xs text-gray-500">(você)</span>
            )}
          </li>
        ))}
      </ul>
    </div>,
    document.body
  )
}

export default ReactionTooltip
