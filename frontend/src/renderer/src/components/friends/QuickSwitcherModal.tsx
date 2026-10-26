import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../Modal'
import Avatar from '../Avatar'
import StyledName from '../StyledName'
import { useFriendStore } from '../../store/friendStore'
import { useChatStore } from '../../store/chatStore'
import { useAuthStore } from '../../store/authStore'
import { useServerStore } from '../../store/serverStore'
import { listChannels, type Channel } from '../../api/channels'
import { conversationRoute, conversationTitle } from '../../lib/conversations'
import { filterSwitcherItems, type SwitcherItem } from '../../lib/quickSwitcher'

const MAX_RESULTS = 50

/**
 * "Encontre ou comece uma conversa" (Ctrl+K): amigos, DMs, servidores e canais
 * de texto. Prefixos: @ pessoas, * servidores, # canais.
 */
function QuickSwitcherModal({
  open,
  onClose
}: {
  open: boolean
  onClose: () => void
}): React.JSX.Element {
  const navigate = useNavigate()
  const meId = useAuthStore((s) => s.user?.id)
  const friends = useFriendStore((s) => s.friends)
  const conversations = useChatStore((s) => s.conversations)
  const servers = useServerStore((s) => s.servers)
  const [channelsByServer, setChannelsByServer] = useState<Record<string, Channel[]>>({})
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)

  // Canais de todos os servidores (o store só guarda os do servidor aberto).
  useEffect(() => {
    let cancelled = false
    Promise.all(
      servers.map((s) =>
        listChannels(s.id)
          .then((list) => [s.id, Array.isArray(list) ? list : []] as const)
          .catch(() => [s.id, [] as Channel[]] as const)
      )
    ).then((entries) => {
      if (!cancelled) setChannelsByServer(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [servers])

  const items = useMemo(() => {
    const all: SwitcherItem[] = []
    const seen = new Set<string>()
    for (const c of conversations) {
      const route = conversationRoute(c, meId)
      seen.add(route)
      all.push({
        key: `conv:${c.id}`,
        kind: 'person',
        label: conversationTitle(c, meId),
        hint:
          c.type === 'group'
            ? `${(c.members ?? []).length} membros`
            : (c.other_user?.username ?? ''),
        route,
        avatar: c.other_user ? { userId: c.other_user.id, url: c.other_user.avatar_url } : undefined,
        nameStyle: c.type !== 'group' ? c.other_user?.name_style : undefined
      })
    }
    for (const f of friends) {
      const route = `/dm/${f.id}`
      if (seen.has(route)) continue
      all.push({
        key: `friend:${f.id}`,
        kind: 'person',
        label: f.display_name || f.username,
        hint: f.username,
        route,
        avatar: { userId: f.id, url: f.avatar_url },
        nameStyle: f.name_style
      })
    }
    for (const s of servers) {
      all.push({
        key: `server:${s.id}`,
        kind: 'server',
        label: s.name,
        hint: 'Servidor',
        route: `/servers/${s.id}`,
        iconUrl: s.icon_url
      })
    }
    for (const s of servers) {
      for (const ch of channelsByServer[s.id] ?? []) {
        if ((ch.type ?? 'text') !== 'text') continue
        all.push({
          key: `channel:${ch.id}`,
          kind: 'channel',
          label: `#${ch.name}`,
          hint: s.name,
          route: `/servers/${s.id}/channels/${ch.id}`
        })
      }
    }
    return filterSwitcherItems(all, query).slice(0, MAX_RESULTS)
  }, [conversations, friends, servers, channelsByServer, meId, query])

  const go = (item: SwitcherItem | undefined): void => {
    if (!item) return
    navigate(item.route)
    onClose()
  }

  return (
    <Modal open={open} title="Encontre ou comece uma conversa" onClose={onClose}>
      <input
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setIndex(0)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setIndex((i) => Math.min(i + 1, items.length - 1))
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            setIndex((i) => Math.max(i - 1, 0))
          } else if (e.key === 'Enter') {
            go(items[index])
          } else if (e.key === 'Escape') {
            onClose()
          }
        }}
        placeholder="Para onde você quer ir?"
        className="w-full rounded-md border border-black/40 bg-[#111214] px-3 py-2.5 text-base text-white outline-none placeholder:text-gray-500 focus:border-[#5865f2]"
      />
      <div className="mt-3 max-h-80 overflow-y-auto">
        {items.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">Nada encontrado.</p>
        )}
        {items.map((item, i) => (
          <button
            key={item.key}
            type="button"
            onMouseEnter={() => setIndex(i)}
            onClick={() => go(item)}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-left ${
              i === index ? 'bg-white/10' : ''
            }`}
          >
            {item.avatar ? (
              <Avatar
                userId={item.avatar.userId}
                name={item.label}
                avatarUrl={item.avatar.url}
                size={24}
              />
            ) : item.iconUrl ? (
              <img src={item.iconUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : (
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#5865f2] text-[11px] font-bold text-white">
                {item.label.replace(/^#/, '').slice(0, 1).toUpperCase()}
              </span>
            )}
            <span className="truncate text-sm text-white">
              {item.kind === 'person' ? (
                <StyledName name={item.label} userId={item.avatar?.userId} style={item.nameStyle} />
              ) : (
                item.label
              )}
            </span>
            <span className="truncate text-xs text-gray-500">{item.hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 border-t border-white/10 pt-2 text-xs text-gray-500">
        Dica: use <b>@</b> para pessoas, <b>*</b> para servidores e <b>#</b> para canais.
      </p>
    </Modal>
  )
}

export default QuickSwitcherModal
