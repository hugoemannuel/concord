import Button from '../../../shared/ui/Button'
import type { LiveReport } from '../api/observability'
import { useSharedLiveReport } from '../hooks/useSharedLiveReport'

/** Busca o relatório das lives e mostra carregando, sem permissão ou erro; pronto, `children`. */
export function LiveReportGate({
  days,
  children
}: {
  days: number
  children: (report: LiveReport) => React.ReactNode
}): React.JSX.Element {
  const { state, reload } = useSharedLiveReport(days)
  if (state.status === 'loading') return <p className="text-ds-sm text-muted">Carregando…</p>
  if (state.status === 'forbidden') {
    return <p className="text-ds-sm text-muted">Só os devs do Salinha veem esta página.</p>
  }
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-ds-sm text-danger">Não foi possível carregar o painel.</p>
        <Button variant="ghost" onClick={reload}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  return <>{children(state.report)}</>
}
