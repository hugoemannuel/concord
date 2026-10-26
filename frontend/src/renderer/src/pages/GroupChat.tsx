import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useChatStore, usePresenceStatus } from '../store/chatStore'
import { useFriendStore } from '../store/friendStore'
import { useUserLook } from '../store/profileStore'
import { profileCardHandler } from '../store/profileCardStore'
import { userMenuHandler } from '../store/userMenuStore'
import { showToast } from '../store/toastStore'
import ChatPane from '../components/ChatPane'
import Avatar from '../components/Avatar'
import StyledName from '../components/StyledName'
import GroupIcon from '../components/friends/GroupIcon'
import CreateGroupModal from '../components/friends/CreateGroupModal'
import ConfirmModal from '../components/friends/ConfirmModal'
import ImageCropModal from '../components/settings/ImageCropModal'
import { FriendsIcon, UserPlusIcon, XIcon } from '../components/icons'
import {
  leaveGroup,
  removeGroupMember,
  renameGroup,
  uploadGroupIcon,
  MAX_GROUP_MEMBERS,
  type ConversationOtherUser
} from '../api/conversations'
import { conversationTitle, otherMembers } from '../lib/conversations'
import { imageFileError } from '../lib/profileValidation'

const MAIN_BG = '#07080b'

function MemberRow({
  member,
  isOwner,
  canRemove,
  onRemove
}: {
  member: ConversationOtherUser
  isOwner: boolean
  canRemove: boolean
  onRemove: () => void
}): React.JSX.Element {
  const meId = useAuthStore((s) => s.user?.id)
  const status = usePresenceStatus(member.id)
  const look = useUserLook(member.id, {
    name: member.display_name || member.username,
    avatarUrl: member.avatar_url
  })
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={profileCardHandler(member.id, look.name, member.username, 'left')}
      onContextMenu={userMenuHandler(member.id, look.name, meId, member.username)}
      className="group flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/6"
    >
      <Avatar
        userId={member.id}
        name={look.name}
        avatarUrl={look.avatarUrl}
        size={32}
        status={status}
        cutoutColor="#0b0c10"
      />
      <span
        className={`min-w-0 flex-1 truncate text-ds-md font-medium ${
          status === 'offline' ? 'text-gray-500' : 'text-gray-200'
        }`}
      >
        <StyledName name={look.name} userId={member.id} style={member.name_style} />
      </span>
      {isOwner && (
        <span title="Dono do grupo" className="text-[#f0b232]">
          👑
        </span>
      )}
      {canRemove && (
        <button
          type="button"
          title="Remover do grupo"
          aria-label="Remover do grupo"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="hidden cursor-pointer text-gray-400 hover:text-[#f23f43] group-hover:block"
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

/** DM em grupo: nome e ícone editáveis, participantes ao lado e o chat. */
function GroupChat(): React.JSX.Element {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const meId = useAuthStore((s) => s.user?.id)
  const conversations = useChatStore((s) => s.conversations)
  const conversationsLoading = useChatStore((s) => s.conversationsLoading)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  const loadFriends = useFriendStore((s) => s.loadAll)
  const conv = conversations.find((c) => c.id === conversationId)

  // Texto do nome enquanto edita (null = mostra o nome salvo).
  const [editingName, setEditingName] = useState<string | null>(null)
  const [showMembers, setShowMembers] = useState(true)
  const [adding, setAdding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [removing, setRemoving] = useState<ConversationOtherUser | null>(null)
  const [cropping, setCropping] = useState<{ file: File; src: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    loadFriends()
    fetchConversations()
  }, [loadFriends, fetchConversations])

  if (!conv || conv.type !== 'group') {
    return (
      <div
        className="flex h-full flex-1 items-center justify-center text-ds-md text-gray-400"
        style={{ background: MAIN_BG }}
      >
        {conversationsLoading ? 'Abrindo conversa...' : 'Conversa não encontrada.'}
      </div>
    )
  }

  const title = conversationTitle(conv, meId)
  const isOwner = conv.owner_id === meId
  const others = otherMembers(conv, meId)

  const saveName = async (): Promise<void> => {
    const name = editingName
    setEditingName(null)
    if (name === null || name.trim() === conv.name.trim()) return
    try {
      await renameGroup(conv.id, name)
      await fetchConversations()
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Não foi possível renomear.')
    }
  }

  const pickIcon = (file: File | undefined): void => {
    if (!file) return
    const error = imageFileError(file)
    if (error) {
      showToast.error(error)
      return
    }
    setCropping({ file, src: URL.createObjectURL(file) })
  }

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden text-gray-100"
      style={{ background: MAIN_BG }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/6 px-4">
        <button
          type="button"
          title="Trocar ícone"
          aria-label="Trocar ícone do grupo"
          onClick={() => fileRef.current?.click()}
          className="cursor-pointer rounded-full transition-opacity hover:opacity-80"
        >
          <GroupIcon id={conv.id} iconUrl={conv.icon_url} size={32} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          hidden
          onChange={(e) => {
            pickIcon(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <input
          value={editingName ?? conv.name}
          onFocus={() => setEditingName(conv.name)}
          onChange={(e) => setEditingName(e.target.value)}
          onBlur={() => void saveName()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') {
              setEditingName(conv.name)
              e.currentTarget.blur()
            }
          }}
          maxLength={100}
          placeholder={title}
          aria-label="Nome do grupo"
          className="min-w-0 max-w-xs flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ds-md font-semibold text-white outline-none placeholder:text-white hover:border-black/40 focus:border-[#5865f2] focus:bg-[#111214]"
        />
        <div className="ml-auto flex items-center gap-3 text-gray-400">
          <button
            type="button"
            title="Adicionar amigos ao grupo"
            aria-label="Adicionar amigos ao grupo"
            disabled={conv.members.length >= MAX_GROUP_MEMBERS}
            onClick={() => setAdding(true)}
            className="cursor-pointer hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <UserPlusIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            title={showMembers ? 'Ocultar lista de membros' : 'Mostrar lista de membros'}
            aria-label="Lista de membros"
            onClick={() => setShowMembers((v) => !v)}
            className={`cursor-pointer hover:text-white ${showMembers ? 'text-white' : ''}`}
          >
            <FriendsIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setLeaving(true)}
            className="cursor-pointer rounded-md px-2 py-1 text-ds-sm font-medium text-[#f23f43] hover:bg-[#f23f43]/10"
          >
            Sair do grupo
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <ChatPane
            room={`conversation:${conv.id}`}
            placeholder={`Conversar em ${title}`}
            mentionable={others.map((m) => ({
              username: m.username,
              display_name: m.display_name
            }))}
          />
        </div>
        {showMembers && (
          <aside className="w-60 shrink-0 overflow-y-auto border-l border-white/6 bg-[#0b0c10]/60 px-2 py-4">
            <p className="px-2 pb-1 text-ds-sm font-medium text-gray-400">
              Membros — {conv.members.length}
            </p>
            {conv.members.map((m) => (
              <MemberRow
                key={m.id}
                member={m}
                isOwner={m.id === conv.owner_id}
                canRemove={isOwner && m.id !== meId}
                onRemove={() => setRemoving(m)}
              />
            ))}
          </aside>
        )}
      </div>

      {adding && (
        <CreateGroupModal
          open
          onClose={() => setAdding(false)}
          groupId={conv.id}
          existingIds={conv.members.map((m) => m.id)}
        />
      )}
      <ConfirmModal
        open={leaving}
        title={`Sair de '${title}'`}
        confirmLabel="Sair do grupo"
        onClose={() => setLeaving(false)}
        onConfirm={async () => {
          try {
            await leaveGroup(conv.id)
            useChatStore.setState((s) => ({
              conversations: s.conversations.filter((c) => c.id !== conv.id)
            }))
            navigate('/friends')
          } catch (err) {
            showToast.error(err instanceof Error ? err.message : 'Não foi possível sair do grupo.')
          }
        }}
      >
        Tem certeza que quer sair do grupo? Você só volta se alguém te adicionar de novo.
      </ConfirmModal>
      <ConfirmModal
        open={removing !== null}
        title={`Remover ${removing?.display_name || removing?.username} do grupo`}
        confirmLabel="Remover"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await removeGroupMember(conv.id, removing.id)
            await fetchConversations()
          } catch (err) {
            showToast.error(err instanceof Error ? err.message : 'Não foi possível remover.')
          }
        }}
      >
        Essa pessoa deixa de ver as mensagens novas do grupo.
      </ConfirmModal>
      {cropping && (
        <ImageCropModal
          file={cropping.file}
          src={cropping.src}
          kind="avatar"
          onCancel={() => {
            URL.revokeObjectURL(cropping.src)
            setCropping(null)
          }}
          onApply={(change) => {
            URL.revokeObjectURL(cropping.src)
            setCropping(null)
            if (change.kind !== 'set') return
            uploadGroupIcon(conv.id, change.file, change.staticFrame)
              .then(() => fetchConversations())
              .catch((err) =>
                showToast.error(
                  err instanceof Error ? err.message : 'Não foi possível trocar o ícone.'
                )
              )
          }}
        />
      )}
    </div>
  )
}

export default GroupChat
