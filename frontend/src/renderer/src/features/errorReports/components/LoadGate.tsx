import Button from '../../../shared/ui/Button'
import type { LoadState } from '../lib/errorPanelState'

/** Carregando, sem permissão, não achado ou erro (com "tentar de novo"); pronto, `children`. */
export function LoadGate<T>({
  state,
  reload,
  missing = 'Esse erro não aparece no período escolhido.',
  children
}: {
  state: LoadState<T>
  reload: () => void
  missing?: string
  children: (data: T) => React.ReactNode
}): React.JSX.Element {
  switch (state.status) {
    case 'loading':
      return (
        <p role="status" className="text-ds-sm text-muted">
          Carregando…
        </p>
      )
    case 'forbidden':
      return <p className="text-ds-sm text-muted">Só os devs do Salinha veem esta página.</p>
    case 'missing':
      return <p className="text-ds-sm text-muted">{missing}</p>
    case 'error':
      return (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-ds-sm text-danger">Não foi possível carregar os erros.</p>
          <Button variant="ghost" onClick={reload}>
            Tentar de novo
          </Button>
        </div>
      )
    case 'ready':
      return <>{children(state.data)}</>
  }
}
