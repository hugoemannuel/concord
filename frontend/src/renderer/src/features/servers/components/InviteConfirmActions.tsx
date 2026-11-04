import Avatar from '../../../shared/ui/Avatar'
import Button from '../../../shared/ui/Button'
import { useAuthStore } from '../../auth/store/authStore'
import type { InvitePreview } from '../api/invites'
import type { InviteJoin } from '../hooks/useInviteJoin'

const LINK = 'cursor-pointer text-ds-sm font-medium text-muted hover:text-strong hover:underline'

type Me = ReturnType<typeof useAuthStore.getState>['user']

function UnverifiedActions({ me, join, onClose }: { me: Me; join: InviteJoin; onClose: () => void }): React.JSX.Element {
  return (
    <>
      <p className="mt-6 text-center text-ds-sm text-normal">
        Confirme seu e-mail{me?.email ? ` (${me.email})` : ''} para entrar no servidor.
        O link está no e-mail que enviamos.
      </p>
      <Button className="mt-4 w-full py-2.5" onClick={() => void join.recheckEmail()} disabled={join.checking}>
        {join.checking ? 'Conferindo...' : 'Já confirmei'}
      </Button>
      <div className="mt-3 flex gap-4">
        <button
          type="button"
          className="cursor-pointer text-ds-sm font-medium text-link hover:text-strong hover:underline"
          onClick={() => void join.resend()}
        >
          Reenviar e-mail
        </button>
        <button type="button" className={LINK} onClick={onClose}>
          Não, obrigado
        </button>
      </div>
    </>
  )
}

function MemberActions({ serverId, onOpen, onClose }: { serverId?: string; onOpen: (id: string) => void; onClose: () => void }): React.JSX.Element {
  return (
    <>
      <p className="mt-6 text-ds-sm font-medium text-normal">Você já está neste servidor</p>
      <Button className="mt-3 w-full py-2.5" onClick={() => serverId && onOpen(serverId)}>
        Abrir servidor
      </Button>
      <button type="button" className={`mt-3 ${LINK}`} onClick={onClose}>
        Fechar
      </button>
    </>
  )
}

function AcceptActions({ me, join, onClose }: { me: Me; join: InviteJoin; onClose: () => void }): React.JSX.Element {
  const myName = me?.display_name || me?.username || 'você'
  return (
    <>
      <Button
        className="mt-8 flex w-full items-center justify-center gap-2 py-2.5"
        onClick={() => void join.accept()}
        disabled={join.joining}
      >
        {me && <Avatar userId={me.id} name={myName} avatarUrl={me.avatar_url} size={20} animate="never" />}
        <span className="truncate">{join.joining ? 'Entrando...' : `Aceitar como ${myName}`}</span>
      </Button>
      <button type="button" className={`mt-3 disabled:opacity-50 ${LINK}`} onClick={onClose} disabled={join.joining}>
        Não, obrigado
      </button>
    </>
  )
}

/** O que dá para fazer com o convite: cada situação é um conjunto de botões. */
export default function InviteConfirmActions({
  preview,
  isMember,
  join,
  onOpen,
  onClose
}: {
  preview: InvitePreview
  isMember: boolean
  join: InviteJoin
  onOpen: (serverId: string) => void
  onClose: () => void
}): React.JSX.Element {
  const me = useAuthStore((s) => s.user)
  if (join.banned) {
    return (
      <Button variant="secondary" className="mt-6 w-full py-2.5" onClick={onClose}>
        Fechar
      </Button>
    )
  }
  // Entrar em servidor pede o e-mail confirmado (contas antigas não trazem o campo).
  if (me?.email_verified === false && !isMember) return <UnverifiedActions me={me} join={join} onClose={onClose} />
  if (isMember) return <MemberActions serverId={preview.server_id} onOpen={onOpen} onClose={onClose} />
  return <AcceptActions me={me} join={join} onClose={onClose} />
}
