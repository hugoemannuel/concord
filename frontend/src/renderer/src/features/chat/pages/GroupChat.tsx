import { errorMessage } from '../../../shared/lib/errorMessage'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../../auth/store/authStore'
import { useChatStore } from '../store/chatStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { showToast } from '../../../shared/store/toastStore'
import ChatPane from '../components/ChatPane'
import GroupChatPlaceholder from '../components/GroupChatPlaceholder'
import GroupMembersAside from '../components/GroupMembersAside'
import MembersToggleButton from '../components/MembersToggleButton'
import MessageSearchBar from '../components/MessageSearchBar'
import CollapsibleSearch from '../components/CollapsibleSearch'
import DisappearingButton from '../disappearing/components/DisappearingButton'
import MobileNavButton from '../../navigation/components/MobileNavButton'
import SearchResultsPanel from '../components/SearchResultsPanel'
import { useSearchStore } from '../store/searchStore'
import GroupIcon from '../../friends/components/GroupIcon'
import CreateGroupModal from '../../friends/components/CreateGroupModal'
import ConfirmModal from '../../friends/components/ConfirmModal'
import ImageCropModal from '../../settings/components/ImageCropModal'
import { UserPlusIcon } from '../../../shared/ui/icons'
import {
  leaveGroup,
  removeGroupMember,
  renameGroup,
  uploadGroupIcon,
  MAX_GROUP_MEMBERS,
  type ConversationOtherUser
} from '../api/conversations'
import { conversationTitle, otherMembers, removeMemberTitle } from '../lib/conversations'
import { initialShowMembers } from '../lib/groupLayout'
import { saveGroupName } from '../lib/groupRename'
import { imageFileError } from '../../profile/lib/profileValidation'
import IconButton from '../../../shared/ui/IconButton'

const MAIN_BG = 'var(--bg-primary)'

/** DM em grupo: nome e ícone editáveis, participantes ao lado e o chat. */
function GroupChat(): React.JSX.Element {
  const { conversationId } = useParams<{ conversationId: string }>()
  const navigate = useNavigate()
  const meId = useAuthStore((s) => s.user?.id)
  const conversations = useChatStore((s) => s.conversations)
  const conversationsLoaded = useChatStore((s) => s.conversationsLoaded)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  const loadFriends = useFriendStore((s) => s.loadAll)
  const conv = conversations.find((c) => c.id === conversationId)

  // Texto do nome enquanto edita (null = mostra o nome salvo).
  const [editingName, setEditingName] = useState<string | null>(null)
  const [showMembers, setShowMembers] = useState(initialShowMembers)
  const searchOpen = useSearchStore(
    (s) => s.scope?.kind === 'conversation' && s.scope.id === conversationId
  )
  const [adding, setAdding] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [removing, setRemoving] = useState<ConversationOtherUser | null>(null)
  const [cropping, setCropping] = useState<{ file: File; src: string } | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    loadFriends()
    fetchConversations()
  }, [loadFriends, fetchConversations])

  if (!conv || conv.type !== 'group') return <GroupChatPlaceholder loaded={conversationsLoaded} />

  const title = conversationTitle(conv, meId)
  const others = otherMembers(conv, meId)

  const saveName = async (): Promise<void> => {
    const name = editingName
    setEditingName(null)
    await saveGroupName(
      { rename: renameGroup, refresh: fetchConversations, error: showToast.error },
      conv,
      name
    )
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
      className="flex h-full w-full flex-col overflow-hidden text-strong"
      style={{ background: MAIN_BG }}
    >
      <header className="relative flex h-14 shrink-0 items-center gap-2 border-b border-subtle px-4 sm:gap-3">
        <MobileNavButton />
        <button
          type="button"
          title="Trocar ícone"
          aria-label="Trocar ícone do grupo"
          onClick={() => fileRef.current?.click()}
          className="shrink-0 cursor-pointer rounded-full transition-opacity hover:opacity-80"
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
          className="min-w-0 max-w-xs flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-ds-md font-semibold text-strong outline-none placeholder:text-strong hover:border-black/40 focus:border-brand focus:bg-floating"
        />
        <div className="ml-auto flex shrink-0 items-center gap-1 text-muted sm:gap-3">
          <IconButton icon={UserPlusIcon} label="Adicionar amigos ao grupo" onClick={() => setAdding(true)} disabled={conv.members.length >= MAX_GROUP_MEMBERS} className="md:size-auto" />
          <DisappearingButton conversationId={conv.id} />
          <MembersToggleButton shown={showMembers} onToggle={() => setShowMembers((v) => !v)} />
          <button
            type="button"
            onClick={() => setLeaving(true)}
            aria-label="Sair do grupo"
            className="cursor-pointer rounded-md px-2 py-1 text-ds-sm font-medium text-danger hover:bg-danger/10 max-md:min-h-10"
          >
            <span className="max-sm:hidden">Sair do grupo</span>
            <span className="sm:hidden">Sair</span>
          </button>
          <CollapsibleSearch>
            <MessageSearchBar
              scope={{ kind: 'conversation', id: conv.id }}
              name={title}
              users={conv.members.map((m) => ({
                id: m.id,
                username: m.username,
                displayName: m.display_name,
                avatarUrl: m.avatar_url
              }))}
            />
          </CollapsibleSearch>
        </div>
      </header>

      <div className="relative flex min-h-0 flex-1">
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
        {searchOpen && <SearchResultsPanel scope={{ kind: 'conversation', id: conv.id }} />}
        {showMembers && !searchOpen && (
          <GroupMembersAside conv={conv} meId={meId} onRemove={setRemoving} />
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
            showToast.error(errorMessage(err, 'Não foi possível sair do grupo.'))
          }
        }}
      >
        Tem certeza que quer sair do grupo? Você só volta se alguém te adicionar de novo.
      </ConfirmModal>
      <ConfirmModal
        open={removing !== null}
        title={removeMemberTitle(removing)}
        confirmLabel="Remover"
        onClose={() => setRemoving(null)}
        onConfirm={async () => {
          if (!removing) return
          try {
            await removeGroupMember(conv.id, removing.id)
            await fetchConversations()
          } catch (err) {
            showToast.error(errorMessage(err, 'Não foi possível remover.'))
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
                showToast.error(errorMessage(err, 'Não foi possível trocar o ícone.'))
              )
          }}
        />
      )}
    </div>
  )
}

export default GroupChat
