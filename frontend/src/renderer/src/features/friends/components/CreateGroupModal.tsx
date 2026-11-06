import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../../../shared/ui/Modal'
import Avatar from '../../../shared/ui/Avatar'
import StyledName from '../../profile/components/StyledName'
import { useFriendStore } from '../store/friendStore'
import { useAuthStore } from '../../auth/store/authStore'
import { useChatStore } from '../../chat/store/chatStore'
import { addGroupMembers, createGroup } from '../../chat/api/conversations'
import { showToast } from '../../../shared/store/toastStore'
import {
  filterAvailableFriends,
  freeSlots,
  groupSubmitLabel,
  slotsHint,
  submitGroupSelection,
  toggleSelected
} from '../lib/groupPicker'

interface CreateGroupModalProps {
  open: boolean
  onClose: () => void
  /** Adicionar a um grupo que já existe (em vez de criar). */
  groupId?: string
  /** Quem já está no grupo (some da lista). */
  existingIds?: string[]
}

/**
 * "Selecionar amigos" do Discord: com um amigo abre a DM; com mais, cria o
 * grupo (até 10 pessoas, contando você).
 */
function CreateGroupModal({
  open,
  onClose,
  groupId,
  existingIds = []
}: CreateGroupModalProps): React.JSX.Element {
  const navigate = useNavigate()
  const meId = useAuthStore((s) => s.user?.id)
  const friends = useFriendStore((s) => s.friends)
  const fetchConversations = useChatStore((s) => s.fetchConversations)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const available = useMemo(
    () => filterAvailableFriends(friends, existingIds, query),
    [friends, existingIds, query]
  )

  const slots = freeSlots(existingIds.length, selected.length)
  const toggle = (id: string): void => setSelected((cur) => toggleSelected(cur, id, slots))

  const submit = async (): Promise<void> => {
    if (selected.length === 0 || busy) return
    setBusy(true)
    await submitGroupSelection(
      {
        addMembers: addGroupMembers,
        createGroup,
        fetchConversations,
        findSummary: (id) => useChatStore.getState().conversations.find((c) => c.id === id),
        navigate,
        done: onClose,
        error: showToast.error
      },
      { groupId, selected, meId }
    )
    setBusy(false)
  }

  return (
    <Modal
      open={open}
      title={groupId ? 'Adicionar amigos ao grupo' : 'Selecionar amigos'}
      onClose={onClose}
    >
      <p className="-mt-2 mb-3 text-xs text-gray-400">{slotsHint(slots)}</p>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Digite o nome de usuário de um amigo"
        className="w-full rounded-md border border-black/40 bg-floating px-3 py-2 text-sm text-strong outline-none placeholder:text-gray-500 focus:border-brand"
      />
      <div className="mt-3 max-h-72 overflow-y-auto">
        {available.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">Nenhum amigo encontrado.</p>
        )}
        {available.map((f) => (
          <label
            key={f.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-fg/5"
          >
            <Avatar
              userId={f.id}
              name={f.display_name || f.username}
              avatarUrl={f.avatar_url}
              decorationUrl={f.avatar_decoration_url}
              size={32}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-strong">
              <StyledName name={f.display_name || f.username} userId={f.id} style={f.name_style} />
              <span className="ml-1.5 text-gray-500">{f.username}</span>
            </span>
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={() => toggle(f.id)}
              className="h-5 w-5 accent-brand"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={selected.length === 0 || busy}
        onClick={submit}
        className="mt-4 w-full cursor-pointer rounded-md bg-brand py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {groupSubmitLabel(groupId, selected.length)}
      </button>
    </Modal>
  )
}

export default CreateGroupModal
