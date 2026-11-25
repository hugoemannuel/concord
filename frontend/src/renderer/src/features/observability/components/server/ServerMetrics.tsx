import Button from '../../../../shared/ui/Button'
import type { ServerReportState } from '../../hooks/useServerReport'
import { Empty } from '../Panel'
import { ApiBlock } from './ApiBlock'
import { VpsBlock } from './VpsBlock'

/** Os blocos VPS e API da aba Servidor (GET /obs/server), com os estados do pedido. */
export function ServerMetrics({
  state,
  now,
  onRetry
}: {
  state: ServerReportState
  now: number
  onRetry: () => void
}): React.JSX.Element {
  if (state.status === 'loading') return <Empty>Carregando…</Empty>
  if (state.status === 'forbidden') return <Empty>Só os devs do Salinha veem esta página.</Empty>
  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-ds-sm text-danger">Não foi possível carregar o painel.</p>
        <Button variant="ghost" onClick={onRetry}>
          Tentar de novo
        </Button>
      </div>
    )
  }
  return (
    <>
      <VpsBlock host={state.report.host} now={now} />
      <ApiBlock api={state.report.api} now={now} />
    </>
  )
}
