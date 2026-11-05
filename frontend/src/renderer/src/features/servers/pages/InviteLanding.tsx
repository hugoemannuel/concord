import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import Button from '../../../shared/ui/Button'
import {
  InviteBackdrop,
  InviteServerIcon,
  InviteServerInfo,
  InviteSpinner
} from '../components/InviteServerInfo'
import { ButtonSkeleton, InvitePreviewSkeleton } from '../../../shared/ui/skeleton/layouts'
import { useInvitePreview } from '../hooks/useInvitePreview'
import { IS_WEB } from '../../../shared/lib/config'
import { looksLikeDesktop, watchAppLaunch } from '../../../shared/lib/appLaunch'
import {
  authPathWithInvite,
  DOWNLOAD_URL,
  inviteDeepLink,
  normalizeInviteCode
} from '../lib/inviteLink'
import { useAuthStore } from '../../auth/store/authStore'
import { useInviteLinkStore } from '../store/inviteLinkStore'

/** Sem o app instalado o navegador não faz nada: depois disso, oferece o download. */
const APP_OPEN_TIMEOUT_MS = 1500

/**
 * /convite/<código>. No navegador: num computador tenta abrir o app na hora
 * (salinha://) e só mostra o cartão do convite, com "Abrir aplicativo" e
 * "Continuar no Navegador", se o app não abrir (celular mostra o cartão
 * direto). No desktop (link salinha://) vai direto para a confirmação.
 */
function InviteLanding(): React.JSX.Element {
  const params = useParams()
  const code = normalizeInviteCode(params.code ?? '')
  if (!code) return <Navigate to="/" replace />
  return IS_WEB ? <InviteCard code={code} /> : <ContinueInApp code={code} />
}

/** Segue para a confirmação no app (logando antes, se precisar, sem perder o código). */
function useContinueInApp(code: string): () => void {
  const navigate = useNavigate()
  return () => {
    if (useAuthStore.getState().accessToken) {
      useInviteLinkStore.getState().open(code)
      navigate('/', { replace: true })
    } else {
      navigate(authPathWithInvite('/login', code), { replace: true })
    }
  }
}

function ContinueInApp({ code }: { code: string }): React.JSX.Element | null {
  const continueInApp = useContinueInApp(code)
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    continueInApp()
  })
  return null
}

function InviteCard({ code }: { code: string }): React.JSX.Element {
  const state = useInvitePreview(code)
  const continueInApp = useContinueInApp(code)
  const [showDownload, setShowDownload] = useState(false)
  // Computador: abre o app logo que a página carrega, antes do cartão.
  const [launching, setLaunching] = useState(() =>
    looksLikeDesktop(navigator.userAgent, navigator.maxTouchPoints)
  )
  const launched = useRef(false)
  const stopWatching = useRef<(() => void) | undefined>(undefined)

  useEffect(() => () => stopWatching.current?.(), [])

  useEffect(() => {
    if (!launching) return
    // Sem o app instalado (ou se a pessoa recusar) o navegador não faz nada:
    // cai no cartão, com o aviso de download. Com o app abrindo na frente, a
    // aba perde o foco: mostra o cartão para quando ela voltar.
    const stop = watchAppLaunch(
      window,
      document,
      APP_OPEN_TIMEOUT_MS,
      () => {
        setLaunching(false)
        setShowDownload(true)
      },
      () => setLaunching(false)
    )
    // Uma tentativa só (o Strict Mode roda o efeito duas vezes no dev).
    if (!launched.current) {
      launched.current = true
      window.location.href = inviteDeepLink(code)
    }
    return stop
  }, [launching, code])

  const openApp = (): void => {
    setShowDownload(false)
    stopWatching.current?.()
    // Sem o app instalado o navegador não faz nada: se a página não perder o
    // foco (o app abrindo na frente) em ~1,5 s, oferece o download.
    stopWatching.current = watchAppLaunch(window, document, APP_OPEN_TIMEOUT_MS, () =>
      setShowDownload(true)
    )
    // Mesmo efeito de clicar num link salinha:// (o navegador pergunta antes).
    window.location.href = inviteDeepLink(code)
  }

  const preview = state.status === 'ready' ? state.preview : null

  if (launching) {
    return (
      <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-tertiary p-4">
        <InviteBackdrop iconUrl={preview?.icon_url} className="fixed inset-0" />
        <div
          role="status"
          className="relative flex w-full max-w-[360px] flex-col items-center rounded-2xl border border-subtle bg-modal p-8 text-center shadow-2xl shadow-black/60 backdrop-blur"
        >
          <InviteSpinner />
          <h1 className="mt-4 text-ds-lg font-bold text-strong">Abrindo a Salinha…</h1>
          <p className="mt-2 text-ds-sm text-gray-300">
            Confirme no seu navegador, se ele perguntar.
          </p>
          <Button variant="secondary" className="mt-6 w-full py-2.5" onClick={continueInApp}>
            Continuar no Navegador
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-10 flex items-center justify-center overflow-y-auto bg-tertiary p-4">
      <InviteBackdrop iconUrl={preview?.icon_url} className="fixed inset-0" />
      <div className="relative w-full max-w-[480px] rounded-2xl border border-subtle bg-modal p-8 shadow-2xl shadow-black/60 backdrop-blur">
        {state.status === 'loading' && (
          <>
            <InvitePreviewSkeleton />
            <div className="mt-8 flex flex-col gap-3">
              <ButtonSkeleton />
              <ButtonSkeleton />
            </div>
          </>
        )}

        {state.status === 'error' && (
          <div className="flex flex-col items-center text-center">
            <InviteServerIcon name="?" />
            <h1 className="mt-4 text-ds-lg font-bold text-strong">Convite indisponível</h1>
            <p className="mt-2 text-ds-sm text-gray-300">{state.message}</p>
            <Link
              to="/"
              className="mt-8 w-full rounded-lg bg-fg/10 px-4 py-2.5 text-ds-sm font-semibold text-strong transition-colors hover:bg-fg/15"
            >
              Ir para a Salinha
            </Link>
          </div>
        )}

        {preview && (
          <>
            <InviteServerInfo preview={preview} code={code} />
            <div className="mt-8 flex flex-col gap-3">
              <Button className="w-full py-2.5" onClick={openApp}>
                Abrir aplicativo
              </Button>
              <Button variant="secondary" className="w-full py-2.5" onClick={continueInApp}>
                Continuar no Navegador
              </Button>
            </div>
            {showDownload && (
              <p className="mt-4 text-center text-ds-sm text-gray-300">
                Não abriu?{' '}
                <a
                  href={DOWNLOAD_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-violet-400 hover:underline"
                >
                  Baixe o app
                </a>
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default InviteLanding
