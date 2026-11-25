import Button from '../../../../shared/ui/Button'
import { useAlertReport } from '../../hooks/useAlertReport'
import { AlertSections } from '../alerts/AlertSections'

/** Aba Alertas: o que está disparado agora e o histórico do período (internal/alert). */
export default function AlertsTab({ days }: { days: number }): React.JSX.Element {
  const { state, reload } = useAlertReport(days)
  if (state.status === 'loading') return <p className="text-ds-sm text-muted">Carregando…</p>
  if (state.status === 'forbidden') {
    return <p className="text-ds-sm text-muted">Só os devs do Salinha veem esta página.</p>
  }
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-ds-sm text-danger">Não foi possível carregar os alertas.</p>
        <Button variant="ghost" onClick={reload}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  return <AlertSections report={state.report} />
}
