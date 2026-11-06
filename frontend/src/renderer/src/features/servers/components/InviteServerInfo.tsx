import type { InvitePreview } from '../api/invites'
import ServerIcon from '../../../shared/ui/ServerIcon'
import { serverIconSrc } from '../lib/serverIcon'
import { formatInviteCount } from '../lib/invitePreview'
import ServerCardView from '../../serverprofile/components/ServerCardView'
import { useInviteCard } from '../../serverprofile/hooks/useServerCard'

/** Ícone do servidor (ou a inicial), como na barra de servidores. */
export function InviteServerIcon({
  name,
  iconUrl,
  size = 64
}: {
  name: string
  iconUrl?: string | null
  size?: number
}): React.JSX.Element {
  return (
    <ServerIcon
      name={name}
      iconUrl={iconUrl}
      size={size}
      shape="xl"
      className="bg-gradient-brand font-bold text-white shadow-lg shadow-black/30"
      fallbackClassName=""
      style={{ fontSize: size * 0.4 }}
    />
  )
}

/**
 * "Você foi convidado(a) para entrar" e o cartão do servidor. Sem o cartão (ainda
 * carregando ou servidor de versão antiga), o básico que a prévia já trouxe.
 */
export function InviteServerInfo({
  preview,
  code,
  signedIn = false
}: {
  preview: InvitePreview
  code?: string
  signedIn?: boolean
}): React.JSX.Element {
  const state = useInviteCard(code, signedIn)
  if (state.status !== 'ready') return <InviteBasics preview={preview} />
  return (
    <div className="flex w-full flex-col gap-3 text-center">
      <p className="text-ds-sm text-secondary">Você foi convidado(a) para entrar</p>
      <ServerCardView card={state.card} />
    </div>
  )
}

/** Ícone, nome e contagens. */
function InviteBasics({ preview }: { preview: InvitePreview }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center text-center">
      <InviteServerIcon name={preview.name} iconUrl={preview.icon_url} />
      <p className="mt-4 text-ds-sm text-secondary">Você foi convidado(a) para entrar</p>
      <h1 className="mt-1 break-words text-ds-xl font-bold text-strong">{preview.name}</h1>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-ds-sm text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden />
          {formatInviteCount(preview.online_count, 'online', 'online')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-[var(--text-secondary)]" aria-hidden />
          {formatInviteCount(preview.member_count, 'membro', 'membros')}
        </span>
      </div>
    </div>
  )
}

/** Imagem do servidor desfocada atrás (ou um degradê, sem ícone). */
export function InviteBackdrop({
  iconUrl,
  className = ''
}: {
  iconUrl?: string | null
  className?: string
}): React.JSX.Element {
  return (
    <div className={`pointer-events-none overflow-hidden ${className}`} aria-hidden>
      {iconUrl ? (
        <>
          <img
            src={serverIconSrc(iconUrl)}
            alt=""
            className="absolute inset-0 h-full w-full scale-125 object-cover opacity-70 blur-2xl"
          />
          <div className="absolute inset-0 bg-black/45 on-media" />
        </>
      ) : (
        <>
          <div className="absolute inset-0 bg-gradient-hero" />
          <div className="absolute -left-1/4 -top-1/4 h-3/4 w-3/4 rounded-full bg-brand/30 blur-3xl" />
          <div className="absolute -bottom-1/4 -right-1/4 h-3/4 w-3/4 rounded-full bg-brand/20 blur-3xl" />
          <div className="absolute inset-0 bg-black/20" />
        </>
      )}
    </div>
  )
}

/** Espera de uma ação (abrindo o app): não é conteúdo carregando, então segue o spinner. */
export function InviteSpinner(): React.JSX.Element {
  return (
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-normal border-t-brand" />
  )
}
