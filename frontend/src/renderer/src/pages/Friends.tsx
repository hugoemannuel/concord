import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  FriendsIcon,
  SearchIcon,
  DotsIcon,
  ChatBubbleIcon,
  XIcon,
  OnlineIcon,
  ClockIcon,
  UserPlusIcon
} from '../components/icons'
import { useAuthStore, type PublicUser } from '../store/authStore'
import { useFriendStore } from '../store/friendStore'
import { useUIStore, type FriendsTab } from '../store/uiStore'
import { useChatStore, usePresenceStatus } from '../store/chatStore'
import { useCallStore } from '../store/callStore'
import { useUserMenuStore } from '../store/userMenuStore'
import { useUserLook } from '../store/profileStore'
import Avatar from '../components/Avatar'
import StyledName from '../components/StyledName'
import type { NameStyle } from '../lib/nameStyle'
import { STATUS_META } from '../lib/presenceStatus'
import { friendRequestError } from '../lib/relationship'
import { showToast } from '../store/toastStore'
import { ActivityLine } from '../components/ActivityLine'
import { ActivityCard } from '../components/ActivityCard'
import { playingFriends } from '../lib/presenceActivity'
import { usePresenceActivityStore } from '../store/presenceActivityStore'
import type { PendingRequest } from '../api/friends'

const MAIN_BG = '#07080b'

const TABS: { id: Exclude<FriendsTab, 'add'>; label: string }[] = [
  { id: 'online', label: 'Online' },
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendente' },
  { id: 'blocked', label: 'Bloqueado' }
]

const matches = (u: { username: string; display_name?: string }, text: string): boolean => {
  const q = text.trim().toLowerCase()
  if (!q) return true
  return u.username.toLowerCase().includes(q) || (u.display_name ?? '').toLowerCase().includes(q)
}

/** Botão redondo de ação da linha (Mensagem, Mais, Aceitar...). */
function RowAction({
  label,
  onClick,
  tone = 'default',
  children
}: {
  label: string
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  tone?: 'default' | 'accept' | 'deny'
  children: React.ReactNode
}): React.JSX.Element {
  const hover =
    tone === 'accept'
      ? 'hover:text-[#23a55a]'
      : tone === 'deny'
        ? 'hover:text-[#f23f43]'
        : 'hover:text-white'
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation()
        onClick(e)
      }}
      className={`flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#111214] text-gray-400 transition-colors ${hover}`}
    >
      {children}
    </button>
  )
}

/** Linha da lista (avatar + nome + subtítulo), com as ações à direita. */
function PersonRow({
  user,
  subtitle,
  showStatus,
  onClick,
  onContextMenu,
  children
}: {
  user: {
    id: string
    username: string
    display_name?: string
    avatar_url?: string | null
    name_style?: NameStyle
  }
  subtitle: React.ReactNode
  showStatus: boolean
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  children: React.ReactNode
}): React.JSX.Element {
  const status = usePresenceStatus(user.id)
  const look = useUserLook(user.id, {
    name: user.display_name || user.username,
    avatarUrl: user.avatar_url
  })
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      onContextMenu={onContextMenu}
      className={`group mx-[-10px] flex items-center gap-3 rounded-lg border-t border-white/6 px-2.5 py-2.5 transition-colors hover:border-transparent hover:bg-white/5 ${
        onClick ? 'cursor-pointer' : ''
      }`}
    >
      <Avatar
        userId={user.id}
        name={look.name}
        avatarUrl={look.avatarUrl}
        size={32}
        status={showStatus ? status : null}
        cutoutColor={MAIN_BG}
      />
      <div className="min-w-0 flex-1">
        <p className="flex items-baseline gap-1.5 truncate text-ds-md font-semibold text-white">
          <StyledName name={look.name} userId={user.id} style={user.name_style} />
          <span className="hidden truncate text-ds-sm font-normal text-gray-400 group-hover:inline">
            {user.username}
          </span>
        </p>
        <p className="truncate text-ds-sm text-gray-400">{subtitle}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2.5">{children}</div>
    </div>
  )
}

function FriendRow({ friend }: { friend: PublicUser }): React.JSX.Element {
  const navigate = useNavigate()
  const status = usePresenceStatus(friend.id)
  const openMenu = (x: number, y: number): void =>
    useUserMenuStore.getState().open({
      userId: friend.id,
      name: friend.display_name || friend.username,
      username: friend.username,
      x,
      y
    })
  const note = friend.status_text?.trim()
  return (
    <PersonRow
      user={friend}
      showStatus
      subtitle={
        <ActivityLine
          userId={friend.id}
          note={status !== 'offline' ? note : null}
          statusLabel={STATUS_META[status].label}
        />
      }
      onClick={() => navigate(`/dm/${friend.id}`)}
      onContextMenu={(e) => {
        e.preventDefault()
        openMenu(e.clientX, e.clientY)
      }}
    >
      <RowAction label="Enviar mensagem" onClick={() => navigate(`/dm/${friend.id}`)}>
        <ChatBubbleIcon className="h-[18px] w-[18px]" />
      </RowAction>
      <RowAction
        label="Mais"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          openMenu(r.left, r.bottom + 4)
        }}
      >
        <DotsIcon className="h-[18px] w-[18px]" />
      </RowAction>
    </PersonRow>
  )
}

function PendingRow({ request }: { request: PendingRequest }): React.JSX.Element {
  const accept = useFriendStore((s) => s.accept)
  const decline = useFriendStore((s) => s.decline)
  const cancel = useFriendStore((s) => s.cancel)
  const [busy, setBusy] = useState(false)
  const user = { ...request, id: request.user_id }

  const run = async (action: () => Promise<void>): Promise<void> => {
    if (busy) return
    setBusy(true)
    try {
      await action()
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Falha na operação.')
    } finally {
      setBusy(false)
    }
  }

  const incoming = request.direction === 'incoming'
  return (
    <PersonRow
      user={user}
      showStatus={false}
      subtitle={incoming ? 'Pedido de amizade recebido' : 'Pedido de amizade enviado'}
    >
      {incoming && (
        <RowAction
          label="Aceitar"
          tone="accept"
          onClick={() => run(() => accept(request.username))}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </RowAction>
      )}
      <RowAction
        label={incoming ? 'Recusar' : 'Cancelar'}
        tone="deny"
        onClick={() => run(() => (incoming ? decline(request.username) : cancel(request.username)))}
      >
        <XIcon className="h-4 w-4" />
      </RowAction>
    </PersonRow>
  )
}

function BlockedRow({ user }: { user: PublicUser }): React.JSX.Element {
  const unblock = useFriendStore((s) => s.unblock)
  return (
    <PersonRow user={user} showStatus={false} subtitle="Bloqueado">
      <button
        type="button"
        onClick={() =>
          unblock(user.id).catch((err) =>
            showToast.error(err instanceof Error ? err.message : 'Falha ao desbloquear.')
          )
        }
        className="cursor-pointer rounded-md bg-[#111214] px-3 py-1.5 text-ds-sm font-medium text-gray-300 transition-colors hover:bg-white/10 hover:text-white"
      >
        Desbloquear
      </button>
    </PersonRow>
  )
}

/** "Adicionar amigo": manda o pedido pelo nome de usuário exato. */
function AddFriend(): React.JSX.Element {
  const sendRequest = useFriendStore((s) => s.sendRequest)
  const [username, setUsername] = useState('')
  const [sending, setSending] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: React.ReactNode } | null>(null)

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault()
    const name = username.trim().replace(/^@/, '')
    if (!name || sending) return
    setSending(true)
    try {
      const result = await sendRequest(name)
      setFeedback({
        ok: true,
        text:
          result === 'accepted' ? (
            <>
              Vocês agora são amigos, <strong>{name}</strong>!
            </>
          ) : (
            <>
              Pedido de amizade enviado para <strong>{name}</strong>!
            </>
          )
      })
      setUsername('')
    } catch (err) {
      setFeedback({ ok: false, text: friendRequestError(err) })
    } finally {
      setSending(false)
    }
  }

  const border = feedback
    ? feedback.ok
      ? 'border-[#23a55a]'
      : 'border-[#f23f43]'
    : 'border-black/40'
  return (
    <section className="border-b border-white/6 pb-5">
      <h2 className="text-ds-lg font-semibold text-white">Adicionar amigo</h2>
      <p className="mt-1 text-ds-sm text-gray-400">
        Você pode adicionar amigos com o nome de usuário deles no Salinha.
      </p>
      <form
        onSubmit={submit}
        className={`mt-4 flex items-center gap-3 rounded-lg border bg-[#111214] py-2 pl-3 pr-2 transition-colors focus-within:border-[#5865f2] ${border}`}
      >
        <input
          autoFocus
          value={username}
          onChange={(e) => {
            setUsername(e.target.value)
            setFeedback(null)
          }}
          maxLength={32}
          placeholder="Você pode adicionar amigos com o nome de usuário deles."
          className="min-w-0 flex-1 bg-transparent text-ds-md text-white outline-none placeholder:text-gray-500"
        />
        <button
          type="submit"
          disabled={!username.trim() || sending}
          className="shrink-0 cursor-pointer rounded-md bg-[#5865f2] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Enviar pedido de amizade
        </button>
      </form>
      {feedback && (
        <p className={`mt-2 text-ds-sm ${feedback.ok ? 'text-[#23a55a]' : 'text-[#f23f43]'}`}>
          {feedback.text}
        </p>
      )}
    </section>
  )
}

function ActiveVoiceFriendCard({ friend }: { friend: PublicUser }): React.JSX.Element {
  const look = useUserLook(friend.id, {
    name: friend.display_name || friend.username,
    avatarUrl: friend.avatar_url
  })
  return (
    <div className="flex items-center gap-3 rounded-lg bg-[#111214] p-3">
      <Avatar userId={friend.id} name={look.name} avatarUrl={look.avatarUrl} size={32} />
      <div className="min-w-0">
        <p className="truncate text-ds-md font-medium text-white">
          <StyledName name={look.name} userId={friend.id} style={friend.name_style} />
        </p>
        <p className="truncate text-ds-xs text-gray-400">Em um canal de voz</p>
      </div>
    </div>
  )
}

/** Coluna "Ativo agora": amigos em canais de voz que o app conhece. */
function ActiveNow({ friends }: { friends: PublicUser[] }): React.JSX.Element {
  const navigate = useNavigate()
  const byUser = usePresenceActivityStore((s) => s.byUser)
  const playing = useMemo(() => playingFriends(friends, byUser), [friends, byUser])
  const serverCalls = useCallStore((s) => s.serverCalls)
  const inVoice = useMemo(() => {
    const ids = new Set<string>()
    for (const state of Object.values(serverCalls)) {
      for (const p of state.participants ?? []) ids.add(p.user_id)
    }
    return friends.filter((f) => ids.has(f.id))
  }, [serverCalls, friends])

  return (
    <aside className="hidden w-[360px] shrink-0 border-l border-white/6 px-4 py-4 xl:block">
      {playing.length > 0 && (
        <>
          <h2 className="text-ds-lg font-bold text-white">Atividade — {playing.length}</h2>
          <div className="mt-3 mb-6 flex flex-col gap-2">
            {playing.map(({ friend, activity }) => (
              <ActivityCard
                key={friend.id}
                user={friend}
                activity={activity}
                onClick={() => navigate(`/dm/${friend.id}`)}
              />
            ))}
          </div>
        </>
      )}
      <h2 className="text-ds-lg font-bold text-white">Ativo agora</h2>
      {inVoice.length === 0 ? (
        <div className="mt-4 text-center">
          <p className="text-ds-md font-semibold text-white">Por enquanto está tudo quieto...</p>
          <p className="mt-1 text-ds-sm text-gray-400">
            Quando um amigo entrar numa conversa de voz, ele aparece aqui.
          </p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {inVoice.map((f) => (
            <ActiveVoiceFriendCard key={f.id} friend={f} />
          ))}
        </div>
      )}
    </aside>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }): React.JSX.Element {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-white/5 text-gray-500">
        {icon}
      </div>
      <p className="max-w-xs text-ds-md text-gray-400">{text}</p>
    </div>
  )
}

function Friends(): React.JSX.Element {
  const me = useAuthStore((s) => s.user)
  const friends = useFriendStore((s) => s.friends)
  const pending = useFriendStore((s) => s.pending)
  const blocked = useFriendStore((s) => s.blocked)
  const loading = useFriendStore((s) => s.loading)
  const loadAll = useFriendStore((s) => s.loadAll)
  const statuses = useChatStore((s) => s.statuses)
  const presence = useChatStore((s) => s.presence)
  const fetchPresenceFor = useChatStore((s) => s.fetchPresenceFor)
  const tab = useUIStore((s) => s.friendsTab)
  const setFriendsTab = useUIStore((s) => s.setFriendsTab)
  const [searchParams, setSearchParams] = useSearchParams()
  const [filterText, setFilterText] = useState('')
  const setTab = (next: FriendsTab): void => {
    setFriendsTab(next)
    setFilterText('')
  }

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Notificação de pedido abre direto em Pendente (/friends?tab=pending).
  useEffect(() => {
    const wanted = searchParams.get('tab') as FriendsTab | null
    if (wanted && ['online', 'all', 'pending', 'blocked', 'add'].includes(wanted)) {
      setFriendsTab(wanted)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, setFriendsTab])

  useEffect(() => {
    if (friends.length > 0) fetchPresenceFor(friends.map((f) => f.id))
  }, [friends, fetchPresenceFor])

  const online = friends.filter((f) => presence[f.id] && (statuses[f.id] ?? 'online') !== 'offline')
  const incoming = pending.filter((p) => p.direction === 'incoming')
  const outgoing = pending.filter((p) => p.direction === 'outgoing')

  const list = (tab === 'online' ? online : friends).filter((f) => matches(f, filterText))
  const filteredIncoming = incoming.filter((p) => matches(p, filterText))
  const filteredOutgoing = outgoing.filter((p) => matches(p, filterText))
  const filteredBlocked = blocked.filter((u) => matches(u, filterText))

  const sectionTitle = (label: string, n: number): React.JSX.Element => (
    <h3 className="mb-2 mt-4 text-ds-sm font-medium text-gray-400">
      {label} — {n}
    </h3>
  )

  const renderBody = (): React.JSX.Element => {
    if (tab === 'add') {
      return (
        <>
          <AddFriend />
          <EmptyState
            icon={<UserPlusIcon className="h-10 w-10" />}
            text="Seus amigos vão aparecer aqui quando aceitarem o pedido."
          />
        </>
      )
    }

    if (tab === 'pending') {
      if (incoming.length + outgoing.length === 0) {
        return (
          <EmptyState
            icon={<ClockIcon className="h-10 w-10" />}
            text="Não há pedidos de amizade pendentes. Que tal mandar um?"
          />
        )
      }
      return (
        <>
          {filteredIncoming.length > 0 && sectionTitle('Recebidos', filteredIncoming.length)}
          {filteredIncoming.map((p) => (
            <PendingRow key={p.user_id} request={p} />
          ))}
          {filteredOutgoing.length > 0 && sectionTitle('Enviados', filteredOutgoing.length)}
          {filteredOutgoing.map((p) => (
            <PendingRow key={p.user_id} request={p} />
          ))}
        </>
      )
    }

    if (tab === 'blocked') {
      if (blocked.length === 0) {
        return (
          <EmptyState
            icon={<XIcon className="h-10 w-10" />}
            text="Você não bloqueou ninguém. Quem você bloquear aparece aqui."
          />
        )
      }
      return (
        <>
          {sectionTitle('Bloqueados', filteredBlocked.length)}
          {filteredBlocked.map((u) => (
            <BlockedRow key={u.id} user={u} />
          ))}
        </>
      )
    }

    if (loading && friends.length === 0) {
      return <p className="mt-6 text-ds-md text-gray-500">Carregando…</p>
    }
    if ((tab === 'online' ? online : friends).length === 0) {
      return (
        <EmptyState
          icon={
            tab === 'online' ? (
              <OnlineIcon className="h-10 w-10" />
            ) : (
              <FriendsIcon className="h-10 w-10" />
            )
          }
          text={
            tab === 'online'
              ? 'Nenhum amigo online agora. Volte mais tarde!'
              : 'Você ainda não tem amigos. Mande um pedido em "Adicionar amigo".'
          }
        />
      )
    }
    return (
      <>
        {sectionTitle(tab === 'online' ? 'Online' : 'Todos os amigos', list.length)}
        {list.map((f) => (
          <FriendRow key={f.id} friend={f} />
        ))}
      </>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col" style={{ background: MAIN_BG }}>
      <header className="flex h-12 shrink-0 items-center gap-4 border-b border-white/6 px-4">
        <div className="flex items-center gap-2 font-semibold text-white">
          <FriendsIcon className="h-5 w-5 text-gray-400" />
          Amigos
        </div>
        <span className="h-6 w-px bg-white/10" />
        <nav className="flex items-center gap-2 overflow-x-auto">
          {TABS.map((t) => {
            const badge = t.id === 'pending' ? incoming.length : 0
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-0.5 text-ds-md font-medium transition-colors ${
                  active
                    ? 'bg-white/10 text-white'
                    : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
                }`}
              >
                {t.label}
                {badge > 0 && (
                  <span className="rounded-full bg-[#f23f43] px-1.5 text-[11px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setTab('add')}
            className={`shrink-0 cursor-pointer rounded-md px-2.5 py-0.5 text-ds-md font-medium transition-colors ${
              tab === 'add'
                ? 'bg-transparent text-[#23a55a]'
                : 'bg-[#248046] text-white hover:bg-[#1a6334]'
            }`}
          >
            Adicionar amigo
          </button>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 pt-4 pb-6">
          {tab !== 'add' && (
            <label className="flex items-center gap-2 rounded-md border border-black/40 bg-[#111214] px-3 py-1.5 focus-within:border-[#5865f2]">
              <input
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Buscar"
                className="min-w-0 flex-1 bg-transparent text-ds-md text-white outline-none placeholder:text-gray-500"
              />
              <SearchIcon className="h-4 w-4 text-gray-500" />
            </label>
          )}
          {renderBody()}
        </div>
        {me && <ActiveNow friends={friends} />}
      </div>
    </div>
  )
}

export default Friends
