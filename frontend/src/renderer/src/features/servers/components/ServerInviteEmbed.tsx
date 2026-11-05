import { memo, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../../../shared/ui/Button'
import { EnvelopeIcon } from '../../../shared/ui/icons'
import { Skeleton } from '../../../shared/ui/skeleton/Skeleton'
import { serverOrigins } from '../lib/appInviteLink'
import { inviteCodesIn } from '../lib/inviteEmbeds'
import { inviteEmbedView } from '../lib/inviteEmbedView'
import { formatInviteCount } from '../lib/invitePreview'
import { useInvitePreviewCache } from '../store/invitePreviewCacheStore'
import { useInviteLinkStore } from '../store/inviteLinkStore'
import { useServerStore } from '../store/serverStore'
import { useAuthStore } from '../../auth/store/authStore'
import { InviteServerIcon } from './InviteServerInfo'

const CARD = 'mt-1 w-full max-w-sm rounded-xl border border-subtle bg-secondary p-3'
const TITLE = 'text-ds-xs font-semibold uppercase tracking-wide text-muted'

/** Cartão do servidor de um convite: nome, online/membros e Entrar (ou Ir para o servidor). */
function ServerInviteEmbed({ code, isMine }: { code: string; isMine: boolean }): React.JSX.Element {
  const entry = useInvitePreviewCache((s) => s.entries[code])
  const servers = useServerStore((s) => s.servers)
  const myServerIds = useMemo(() => servers.map((s) => s.id), [servers])
  const navigate = useNavigate()
  useEffect(() => useInvitePreviewCache.getState().ensure(code), [code])

  const view = inviteEmbedView(entry, isMine, myServerIds)
  if (view.kind === 'loading') {
    return (
      <div role="status" aria-label="Carregando convite" className={`${CARD} flex gap-3`}>
        <Skeleton className="h-12 w-12 rounded-xl" />
        <div className="flex flex-1 flex-col justify-center gap-2">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
    )
  }
  if (view.kind === 'invalid') {
    return (
      <div className={`${CARD} flex items-center gap-3`}>
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-fg/5 text-danger">
          <EnvelopeIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-ds-sm font-semibold text-danger">Convite inválido</p>
          <p className="break-words text-ds-xs text-muted">{view.hint}</p>
        </div>
      </div>
    )
  }

  const { preview } = view
  const act = (): void => {
    if (view.action === 'open' && preview.server_id) navigate(`/servers/${preview.server_id}`)
    else useInviteLinkStore.getState().open(code)
  }
  return (
    <div role="group" aria-label={view.title} className={`${CARD} flex flex-col gap-2`}>
      <p className={TITLE}>{view.title}</p>
      <div className="flex flex-wrap items-center gap-3">
        <InviteServerIcon name={preview.name} iconUrl={preview.icon_url} size={48} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ds-md font-bold text-strong" title={preview.name}>
            {preview.name}
          </p>
          <p className="flex flex-wrap items-center gap-x-3 text-ds-xs text-muted">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
              {formatInviteCount(preview.online_count, 'online', 'online')}
            </span>
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)]" aria-hidden />
              {formatInviteCount(preview.member_count, 'membro', 'membros')}
            </span>
          </p>
        </div>
        <Button type="button" variant="success" size="sm" onClick={act}>
          {view.action === 'open' ? 'Ir para o servidor' : 'Entrar'}
        </Button>
      </div>
    </div>
  )
}

/**
 * Cartões dos links de convite nossos que estão no texto da mensagem, como no
 * Discord. O link continua no texto (clicar nele também abre a confirmação).
 */
function MessageInviteEmbeds({
  content,
  authorId
}: {
  content: string
  authorId: string
}): React.JSX.Element | null {
  const isMine = useAuthStore((s) => s.user?.id === authorId)
  const codes = useMemo(() => inviteCodesIn(content, serverOrigins()), [content])
  if (codes.length === 0) return null
  return (
    <>
      {codes.map((code) => (
        <ServerInviteEmbed key={code} code={code} isMine={isMine} />
      ))}
    </>
  )
}

export default memo(MessageInviteEmbeds)
