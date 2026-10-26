import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Modal from '../Modal'
import Avatar from '../Avatar'
import StyledName from '../StyledName'
import { useFriendStore } from '../../store/friendStore'
import { useAuthStore } from '../../store/authStore'
import { useChatStore } from '../../store/chatStore'
import { addGroupMembers, createGroup, MAX_GROUP_MEMBERS } from '../../api/conversations'
import { conversationRoute } from '../../lib/conversations'
import { showToast } from '../../store/toastStore'

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

  const available = useMemo(() => {
    const q = query.trim().toLowerCase()
    return friends
      .filter((f) => !existingIds.includes(f.id))
      .filter(
        (f) =>
          !q || f.username.toLowerCase().includes(q) || f.display_name.toLowerCase().includes(q)
      )
  }, [friends, existingIds, query])

  const slots = MAX_GROUP_MEMBERS - Math.max(existingIds.length, 1) - selected.length
  const toggle = (id: string): void =>
    setSelected((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : slots > 0 ? [...cur, id] : cur
    )

  const submit = async (): Promise<void> => {
    if (selected.length === 0 || busy) return
    setBusy(true)
    try {
      if (groupId) {
        await addGroupMembers(groupId, selected)
        await fetchConversations()
      } else {
        const conv = await createGroup(selected)
        await fetchConversations()
        const summary = useChatStore.getState().conversations.find((c) => c.id === conv.id)
        navigate(
          summary
            ? conversationRoute(summary, meId)
            : conv.type === 'group'
              ? `/dm/c/${conv.id}`
              : `/dm/${selected[0]}`
        )
      }
      onClose()
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Não foi possível criar o grupo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={groupId ? 'Adicionar amigos ao grupo' : 'Selecionar amigos'}
      onClose={onClose}
    >
      <p className="-mt-2 mb-3 text-xs text-gray-400">
        {slots > 0
          ? `Você pode adicionar mais ${slots} ${slots === 1 ? 'amigo' : 'amigos'}.`
          : 'Este grupo já está cheio.'}
      </p>
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Digite o nome de usuário de um amigo"
        className="w-full rounded-md border border-black/40 bg-[#111214] px-3 py-2 text-sm text-white outline-none placeholder:text-gray-500 focus:border-[#5865f2]"
      />
      <div className="mt-3 max-h-72 overflow-y-auto">
        {available.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">Nenhum amigo encontrado.</p>
        )}
        {available.map((f) => (
          <label
            key={f.id}
            className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 hover:bg-white/5"
          >
            <Avatar
              userId={f.id}
              name={f.display_name || f.username}
              avatarUrl={f.avatar_url}
              size={32}
            />
            <span className="min-w-0 flex-1 truncate text-sm text-white">
              <StyledName name={f.display_name || f.username} userId={f.id} style={f.name_style} />
              <span className="ml-1.5 text-gray-500">{f.username}</span>
            </span>
            <input
              type="checkbox"
              checked={selected.includes(f.id)}
              onChange={() => toggle(f.id)}
              className="h-5 w-5 accent-[#5865f2]"
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        disabled={selected.length === 0 || busy}
        onClick={submit}
        className="mt-4 w-full cursor-pointer rounded-md bg-[#5865f2] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-50"
      >
        {groupId ? 'Adicionar' : selected.length > 1 ? 'Criar grupo' : 'Criar DM'}
      </button>
    </Modal>
  )
}

export default CreateGroupModal
