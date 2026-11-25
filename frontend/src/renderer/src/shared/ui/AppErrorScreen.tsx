import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { useRouteError } from 'react-router-dom'
import { updateFromErrorScreen } from '../../features/updates/lib/appUpdate'
import Button from './Button'
import UpdateBar from '../../features/updates/components/UpdateBar'
import { reportAppError } from '../lib/errorSink'

/**
 * "Algo deu errado": no lugar da tela crua de erro do react-router (ou da tela
 * branca) quando um componente quebra. Recarregar costuma resolver; app
 * antigo falando com servidor novo resolve atualizando.
 */
export function AppErrorScreen({ error }: { error?: unknown }): React.JSX.Element {
  const canUpdate = typeof window !== 'undefined' && !!window.api?.updates
  const [updateMessage, setUpdateMessage] = useState<string | null>(null)
  const detail = error instanceof Error ? error.message : error ? String(error) : null

  const checkUpdate = async (): Promise<void> => {
    setUpdateMessage('Procurando atualização…')
    const result = await updateFromErrorScreen()
    setUpdateMessage(
      result === 'installing'
        ? 'Baixando a versão nova. O app reinicia sozinho.'
        : result === 'checking'
          ? 'Se houver versão nova, o aviso aparece aqui.'
          : 'Atualização indisponível aqui.'
    )
  }

  return (
    <div
      role="alert"
      className="flex h-full min-h-screen w-full items-center justify-center bg-secondary p-6 text-center"
    >
      <div className="w-full max-w-sm">
        <p className="text-ds-lg font-semibold text-strong">Algo deu errado</p>
        <p className="mt-2 text-ds-sm text-muted">
          Esta tela encontrou um problema. Recarregue o app; se continuar, verifique se há uma
          versão nova.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Button onClick={() => window.location.reload()}>Recarregar</Button>
          {canUpdate && (
            <Button variant="ghost" onClick={() => void checkUpdate()}>
              Verificar atualização
            </Button>
          )}
        </div>
        {updateMessage && <p className="mt-3 text-ds-xs text-muted">{updateMessage}</p>}
        <div className="mt-4 w-full">
          <UpdateBar />
        </div>
        {detail && (
          <details className="mt-5 text-left text-ds-xs text-faint">
            <summary className="cursor-pointer">Detalhes</summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{detail}</pre>
          </details>
        )}
      </div>
    </div>
  )
}

/** errorElement do router: erro de render/loader numa rota. */
export function RouteErrorScreen(): React.JSX.Element {
  const error = useRouteError()
  useEffect(() => {
    console.error('[router] erro na tela:', error)
    reportAppError(error, 'rota')
  }, [error])
  return <AppErrorScreen error={error} />
}

/** Erro fora das rotas (menus, modais, telas de configurações). */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state = { error: null as unknown }

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error: error ?? new Error('erro desconhecido') }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[app] erro na tela:', error, info.componentStack)
    // Só o erro: o componentStack, as props e o estado ficam no aparelho.
    reportAppError(error, 'tela')
  }

  render(): ReactNode {
    if (this.state.error) return <AppErrorScreen error={this.state.error} />
    return this.props.children
  }
}
