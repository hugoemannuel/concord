import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useInviteLinkStore } from '../store/inviteLinkStore'
import { useServerStore } from '../store/serverStore'
import Button from '../../../shared/ui/Button'
import { InviteBackdrop, InviteServerIcon, InviteServerInfo } from './InviteServerInfo'
import InviteConfirmActions from './InviteConfirmActions'
import { ButtonSkeleton, InvitePreviewSkeleton } from '../../../shared/ui/skeleton/layouts'
import { Skeleton } from '../../../shared/ui/skeleton/Skeleton'
import { useInviteJoin, type InviteJoin } from '../hooks/useInviteJoin'
import { useInvitePreview } from '../hooks/useInvitePreview'

/**
 * Confirmação do convite aberto por link (navegador ou salinha://), estilo
 * Discord: "Aceitar como <nome>" ou "Não, obrigado". Fica dentro do app
 * logado (AppShell).
 */
function InviteConfirmModal(): React.JSX.Element | null {
  const code = useInviteLinkStore((s) => s.code)
  if (!code) return null
  // key: outro link zera o estado (prévia, erro, entrando).
  return <InviteConfirm key={code} code={code} />
}

function InviteConfirm({ code }: { code: string }): React.JSX.Element {
  const navigate = useNavigate()
  const close = useInviteLinkStore((s) => s.close)
  const servers = useServerStore((s) => s.servers)
  const state = useInvitePreview(code, true)
  const openServer = (serverId: string): void => {
    close()
    navigate(`/servers/${serverId}`)
  }
  const join = useInviteJoin(code, openServer)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [close])

  const preview = state.status === 'ready' ? state.preview : null
  // is_member vem do servidor (logado); a lista local cobre o resto.
  const isMember = preview
    ? (preview.is_member ?? servers.some((s) => s.id === preview.server_id))
    : false

  return createPortal(
    <div
      className="app-no-drag fixed inset-x-0 bottom-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      style={{ top: 'var(--titlebar-height, 0px)' }}
      onClick={close}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={preview ? `Convite para ${preview.name}` : 'Convite'}
        className="flex max-h-full w-full max-w-[880px] overflow-hidden rounded-xl border border-subtle bg-modal shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-h-[420px] w-full flex-col items-center overflow-y-auto px-8 py-10 md:w-[420px] md:shrink-0">
          {state.status === 'loading' && <InviteLoading />}
          {state.status === 'error' && <InviteUnavailable message={state.message} onClose={close} />}
          {preview && (
            <div className="flex w-full flex-1 flex-col items-center">
              <div className="flex w-full flex-1 flex-col justify-center">
                <InviteServerInfo preview={preview} code={code} signedIn />
              </div>
              <InviteNotices join={join} />
              <InviteConfirmActions preview={preview} isMember={isMember} join={join} onOpen={openServer} onClose={close} />
            </div>
          )}
        </div>

        {/* Arte do servidor (o banner, no Discord): o ícone grande ou um degradê. */}
        <div className="relative hidden min-h-[420px] flex-1 md:block">
          <InviteBackdrop iconUrl={preview?.icon_url} className="absolute inset-0" />
          {preview && (
            <div className="absolute inset-0 flex items-center justify-center">
              <InviteServerIcon name={preview.name} iconUrl={preview.icon_url} size={160} />
            </div>
          )}
          {state.status === 'loading' && (
            <div aria-hidden className="absolute inset-0 flex items-center justify-center">
              <Skeleton className="h-40 w-40 rounded-xl" />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function InviteLoading(): React.JSX.Element {
  return (
    <div className="flex w-full flex-1 flex-col items-center">
      <div className="flex flex-1 flex-col justify-center">
        <InvitePreviewSkeleton />
      </div>
      <ButtonSkeleton className="mt-8" />
      <div className="mt-3 flex h-[18px] items-center">
        <Skeleton className="h-3 w-24" />
      </div>
    </div>
  )
}

function InviteUnavailable({ message, onClose }: { message: string; onClose: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-center text-center">
      <InviteServerIcon name="?" />
      <h1 className="mt-4 text-ds-lg font-bold text-strong">Convite indisponível</h1>
      <p className="mt-2 text-ds-sm text-normal">{message}</p>
      <Button variant="secondary" className="mt-8 w-full" onClick={onClose}>
        Fechar
      </Button>
    </div>
  )
}

function InviteNotices({ join }: { join: InviteJoin }): React.JSX.Element {
  return (
    <>
      {join.joinError && (
        <p
          role="alert"
          className="mt-6 w-full rounded-lg border border-danger/30 bg-danger/15 px-3 py-2 text-center text-ds-sm text-danger"
        >
          {join.joinError}
        </p>
      )}
      {join.notice && <p className="mt-6 w-full text-center text-ds-sm text-success">{join.notice}</p>}
    </>
  )
}

export default InviteConfirmModal
