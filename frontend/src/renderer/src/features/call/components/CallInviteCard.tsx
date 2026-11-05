import { useEffect, useMemo } from 'react'
import Avatar from '../../../shared/ui/Avatar'
import { ChevronRightIcon, EnvelopeIcon, VolumeIcon } from '../../../shared/ui/icons'
import { useAuthStore } from '../../auth/store/authStore'
import type { Message } from '../../chat/api/messages'
import { useOpenCallInvite } from '../hooks/useOpenCallInvite'
import { cardView } from '../lib/callInviteCard'
import { INVITE_COPY } from '../lib/callInviteCopy'
import { useInviteValidity, useInviteValidityStore } from '../store/inviteValidityStore'
import Button from '../../../shared/ui/Button'

const CARD = 'mt-1 w-full max-w-sm rounded-xl border border-subtle bg-secondary p-3'

/** Cartão cinza de quando a call acabou: sem botão. */
function InvalidInvite(): React.JSX.Element {
  return (
    <div className={`${CARD} flex items-center gap-3`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fg/5 text-danger">
        <EnvelopeIcon className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="break-words text-ds-sm font-semibold text-danger">
          {INVITE_COPY.cardInvalidTitle}
        </p>
        <p className="break-words text-ds-xs text-muted">{INVITE_COPY.cardInvalidHint}</p>
      </div>
    </div>
  )
}

/**
 * Cartão de convite para a call dentro da mensagem da DM: onde é a call, quem
 * convidou e o botão "Abrir" (só para quem recebeu). Vira "Convite inválido"
 * quando a call acaba, sozinho.
 */
function CallInviteCard({ message }: { message: Message }): React.JSX.Element | null {
  const invite = message.call_invite
  const meId = useAuthStore((s) => s.user?.id)
  const isMine = message.author_id === meId
  const card = useMemo(
    () => ({
      callId: invite?.call_id ?? '',
      messageId: message.id,
      role: isMine ? ('inviter' as const) : ('invitee' as const)
    }),
    [invite?.call_id, message.id, isMine]
  )
  const validity = useInviteValidity(card)
  const { busy, open } = useOpenCallInvite(
    invite ?? { call_id: '', channel_id: '', server_id: null }
  )
  useEffect(() => {
    if (card.callId) void useInviteValidityStore.getState().ensure(card)
  }, [card])
  if (!invite) return null

  const author = message.author
  const authorName = author?.display_name || author?.username || ''
  const view = cardView({
    invite,
    authorName,
    isMine,
    validity
  })
  if (view.kind === 'invalid') return <InvalidInvite />

  return (
    <div role="group" aria-label={view.title} className={`${CARD} flex flex-col gap-3`}>
      <p className="flex min-w-0 items-center gap-1.5 text-ds-xs text-muted">
        <VolumeIcon className="h-4 w-4 shrink-0" />
        <span className="truncate" title={view.place}>
          {view.place}
        </span>
        <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
      </p>
      <div className="flex items-center justify-between gap-3 rounded-lg bg-success/10 p-3">
        <p className="min-w-0 break-words text-ds-md font-bold text-strong">{view.title}</p>
        <Avatar
          userId={message.author_id}
          name={authorName}
          avatarUrl={author?.avatar_url}
          decorationUrl={author?.avatar_decoration_url}
          size={56}
          className="shrink-0"
        />
      </div>
      {view.button !== 'none' && (
        <Button
          type="button"
          variant="success"
          disabled={view.button === 'loading' || busy}
          onClick={open}
          className="w-full"
        >
          {INVITE_COPY.cardOpen}
        </Button>
      )}
    </div>
  )
}

export default CallInviteCard
