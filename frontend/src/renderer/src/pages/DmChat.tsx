import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useFriendStore, useRelationship } from '../store/friendStore'
import { useUserMenuStore } from '../store/userMenuStore'
import { useChatStore, usePresenceStatus } from '../store/chatStore'
import { useUserLook } from '../store/profileStore'
import { profileCardHandler } from '../store/profileCardStore'
import { STATUS_META } from '../lib/presenceStatus'
import Avatar from '../components/Avatar'
import StyledName from '../components/StyledName'
import { useCallStore } from '../store/callStore'
import { getOrCreateConversationWith } from '../api/conversations'
import { showToast } from '../store/toastStore'
import ChatPane from '../components/ChatPane'
import DmCallView from '../components/call/DmCallView'
import { PhoneIcon, PhoneOffIcon } from '../components/icons'

function DmChat(): React.JSX.Element {
  const { userId } = useParams<{ userId: string }>()
  const me = useAuthStore((s) => s.user)
  const friends = useFriendStore((s) => s.friends)
  const loadFriends = useFriendStore((s) => s.loadAll)
  const conversations = useChatStore((s) => s.conversations)
  const presence = useChatStore((s) => s.presence)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  const callStatus = useCallStore((s) => s.status)
  const inCallWithUser = useCallStore(
    (s) => s.status !== 'idle' && s.type === 'dm' && s.participants.some((p) => p.id === userId)
  )
  const startDMCall = useCallStore((s) => s.startDMCall)
  const endCall = useCallStore((s) => s.endCall)

  const [conversationId, setConversationId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!userId) return

    const open = async (): Promise<void> => {
      try {
        const conv = await getOrCreateConversationWith(userId)
        if (cancelled) return
        setConversationId(conv.id)
        // Conversa nova (ex.: alguém do servidor que não é amigo): atualiza a
        // lista para o nome dela aparecer no topo e na barra lateral.
        void fetchConversations()
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Falha ao abrir conversa.')
          showToast.error('Não foi possível abrir a conversa.')
        }
      }
    }
    open()
    return () => {
      cancelled = true
    }
  }, [userId, fetchConversations])

  useEffect(() => {
    loadFriends()
    fetchConversations()
  }, [loadFriends, fetchConversations])

  const other =
    friends.find((f) => f.id === userId) ??
    conversations.find((c) => c.other_user?.id === userId)?.other_user

  const otherName =
    other?.display_name ??
    other?.username ??
    (userId === me?.id ? me?.display_name : 'Usuário') ??
    'Usuário'
  const otherHandle = other?.username ?? (userId === me?.id ? me?.username : '')
  const dmMentionable = otherHandle ? [{ username: otherHandle, display_name: otherName }] : []
  const online = Boolean(userId && presence[userId])
  const status = usePresenceStatus(userId)
  const look = useUserLook(userId, { name: otherName, avatarUrl: other?.avatar_url })
  const blocked = useRelationship(userId) === 'blocked'
  const blockedReason = blocked
    ? 'Você bloqueou esta pessoa. Desbloqueie para mandar mensagens.'
    : undefined

  const openMenu = (e: React.MouseEvent): void => {
    if (!userId || userId === me?.id) return
    e.preventDefault()
    useUserMenuStore.getState().open({
      userId,
      name: look.name,
      username: otherHandle || undefined,
      conversationId: conversationId ?? undefined,
      x: e.clientX,
      y: e.clientY
    })
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-[#07080b]/90 backdrop-blur-2xl text-gray-100">
      <header
        onContextMenu={openMenu}
        className="flex h-14 shrink-0 items-center gap-3 border-b border-white/6 px-4"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={
              userId
                ? profileCardHandler(userId, look.name, otherHandle || undefined, 'right')
                : undefined
            }
            aria-label={`Perfil de ${look.name}`}
            className="cursor-pointer rounded-full"
          >
            <Avatar
              userId={userId}
              name={otherName}
              avatarUrl={other?.avatar_url}
              size={32}
              animate="always"
              status={status}
              cutoutColor="#07080b"
            />
          </button>
          <div className="min-w-0">
            <p className="truncate text-ds-md font-semibold text-white">
              <StyledName name={look.name} userId={userId} style={other?.name_style} />
            </p>
            {otherHandle && <p className="truncate text-ds-xs text-gray-400">@{otherHandle}</p>}
          </div>
        </div>
        <span className="text-ds-xs font-semibold" style={{ color: STATUS_META[status].color }}>
          {STATUS_META[status].label}
        </span>
        <div className="ml-auto">
          {inCallWithUser ? (
            <button
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-[#f23f43] text-white transition-colors hover:bg-[#d83a3e]"
              onClick={endCall}
              aria-label="Encerrar chamada"
              title="Encerrar chamada"
            >
              <PhoneOffIcon className="h-[18px] w-[18px]" />
            </button>
          ) : (
            <button
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full bg-white/5 text-gray-300 transition-colors hover:bg-white/10 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => {
                if (!conversationId || !userId) return
                void startDMCall(conversationId, {
                  id: userId,
                  username: otherHandle || '',
                  display_name: otherName
                })
              }}
              disabled={!online || !conversationId || callStatus !== 'idle' || blocked}
              aria-label="Iniciar chamada de voz"
              title={
                callStatus !== 'idle'
                  ? 'Você já está em uma chamada'
                  : online
                    ? 'Iniciar chamada de voz'
                    : 'Usuário offline'
              }
            >
              <PhoneIcon className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </header>

      {error ? (
        <div className="flex flex-1 items-center justify-center text-ds-md text-gray-400">
          <p>{error}</p>
        </div>
      ) : conversationId ? (
        inCallWithUser ? (
          <DmCallView>
            <ChatPane
              room={`conversation:${conversationId}`}
              placeholder={`Mensagem para @${otherHandle || otherName}`}
              mentionable={dmMentionable}
              disabledReason={blockedReason}
            />
          </DmCallView>
        ) : (
          <ChatPane
            room={`conversation:${conversationId}`}
            placeholder={`Mensagem para @${otherHandle || otherName}`}
            mentionable={dmMentionable}
            disabledReason={blockedReason}
          />
        )
      ) : (
        <div className="flex flex-1 items-center justify-center text-ds-md text-gray-400">
          <p>Abrindo conversa...</p>
        </div>
      )}
    </div>
  )
}

export default DmChat
