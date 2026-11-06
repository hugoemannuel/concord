import { errorMessage } from '../../../shared/lib/errorMessage'
import { useEffect, useState } from 'react'
import InviteCodeBox from './InviteCodeBox'
import { useServerStore } from '../store/serverStore'
import { sendServerInvite } from '../lib/sendServerInvite'
import { useFriendStore } from '../../friends/store/friendStore'
import { useUIStore } from '../../../shared/store/uiStore'
import { showToast } from '../../../shared/store/toastStore'
import Button from '../../../shared/ui/Button'
import Input from '../../../shared/ui/Input'
import Modal from '../../../shared/ui/Modal'
import Avatar from '../../../shared/ui/Avatar'
import { SearchIcon } from '../../../shared/ui/icons'
import type { Server } from '../api/servers'

/** "Convidar amigos para {servidor}": o código de convite e a lista de amigos. */
function ServerInviteModal({ server }: { server: Server }): React.JSX.Element {
  const currentMembers = useServerStore((s) => s.currentMembers)
  const friends = useFriendStore((s) => s.friends)
  const inviteModalOpen = useUIStore((s) => s.serverInviteModalOpen)
  const closeInviteModal = useUIStore((s) => s.closeServerInviteModal)

  const [inviteFilter, setInviteFilter] = useState('')
  const [invitingId, setInvitingId] = useState<string | null>(null)
  // Quem já recebeu o link na DM enquanto o modal está aberto (como o "Enviado" do Discord).
  const [sentIds, setSentIds] = useState<ReadonlySet<string>>(() => new Set())
  const id = server.id

  useEffect(() => {
    if (!inviteModalOpen) setSentIds(new Set())
  }, [inviteModalOpen, id])

  const handleInvite = async (friendUserId: string, friendUsername: string): Promise<void> => {
    setInvitingId(friendUserId)
    try {
      await sendServerInvite(id, friendUserId)
      setSentIds((prev) => new Set(prev).add(friendUserId))
      showToast.success(`Convite enviado para @${friendUsername}!`)
    } catch (err) {
      showToast.error(errorMessage(err, 'Falha ao convidar amigo.'))
    } finally {
      setInvitingId(null)
    }
  }

  const memberUserIds = new Set(currentMembers.map((m) => m.user_id))

  const inviteTerm = inviteFilter.trim().toLowerCase()
  const filteredFriends = friends.filter((f) => {
    if (!inviteTerm) return true
    return (
      (f.display_name ?? '').toLowerCase().includes(inviteTerm) ||
      f.username.toLowerCase().includes(inviteTerm)
    )
  })

  return (
    <Modal
      open={inviteModalOpen}
      title={`Convidar amigos para ${server.name}`}
      onClose={closeInviteModal}
    >
      <div className="space-y-4">
        <InviteCodeBox serverId={server.id} />
        <p className="text-ds-sm text-muted">
          Ou mande o convite na conversa com um amigo.
        </p>

        <div className="relative">
          <Input
            placeholder="Buscar amigo por nome"
            value={inviteFilter}
            onChange={(e) => setInviteFilter(e.target.value)}
            className="glass-input pl-9 text-ds-md"
            autoFocus
          />
          <SearchIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted" />
        </div>

        {friends.length === 0 ? (
          <p className="py-6 text-center text-ds-xs text-faint italic">
            Você ainda não tem amigos para convidar. Adicione amigos primeiro na aba
            &quot;Amigos&quot;.
          </p>
        ) : (
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto no-scrollbar pr-1">
            {filteredFriends.map((f) => {
              const alreadyInServer = memberUserIds.has(f.id)
              const alreadySent = sentIds.has(f.id)
              const isInviting = invitingId === f.id

              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between rounded-xl border border-subtle bg-fg/3 p-2.5"
                >
                  <div className="flex items-center gap-3">
                    <Avatar
                      userId={f.id}
                      name={f.display_name ?? f.username}
                      avatarUrl={f.avatar_url}
                      size={32}
                    />
                    <div className="leading-tight">
                      <p className="text-ds-md font-medium text-strong">{f.display_name}</p>
                      <p className="text-ds-xs text-muted">@{f.username}</p>
                    </div>
                  </div>

                  {alreadyInServer ? (
                    <span className="text-ds-xs text-faint">Já é membro</span>
                  ) : alreadySent ? (
                    <span className="text-ds-xs text-success">Enviado</span>
                  ) : (
                    <Button
                      variant="success"
                      size="sm"
                      disabled={isInviting}
                      onClick={() => handleInvite(f.id, f.username)}
                    >
                      {isInviting ? 'Convidando…' : 'Convidar'}
                    </Button>
                  )}
                </div>
              )
            })}

            {filteredFriends.length === 0 && (
              <p className="py-6 text-center text-ds-xs text-faint italic">
                Nenhum amigo encontrado para &quot;{inviteFilter}&quot;.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}

export default ServerInviteModal
