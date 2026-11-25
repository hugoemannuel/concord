import Button from '../../../../shared/ui/Button'
import { useLiveReport, type ReportState } from '../../hooks/useLiveReport'
import { useServerReport, type ServerReportState } from '../../hooks/useServerReport'
import { Empty } from '../Panel'
import { ApiBlock } from './ApiBlock'
import { LiveKitBlock } from './LiveKitBlock'
import { VpsBlock } from './VpsBlock'

function Failed({ onRetry }: { onRetry: () => void }): React.JSX.Element {
  return (
    <div className="flex flex-col items-start gap-3">
      <p className="text-ds-sm text-danger">Não foi possível carregar o painel.</p>
      <Button variant="ghost" onClick={onRetry}>
        Tentar de novo
      </Button>
    </div>
  )
}

/** O bloco do LiveKit vem do relatório das lives (a série já existe lá). */
function LiveKitPart({ state }: { state: ReportState }): React.JSX.Element | null {
  return state.status === 'ready' ? <LiveKitBlock points={state.report.server} /> : null
}

export function ServerTabBody({
  state,
  live,
  now,
  onRetry
}: {
  state: ServerReportState
  live: ReportState
  now: number
  onRetry: () => void
}): React.JSX.Element {
  if (state.status === 'loading') return <Empty>Carregando…</Empty>
  if (state.status === 'forbidden') return <Empty>Só os devs do Salinha veem esta página.</Empty>
  if (state.status === 'error') return <Failed onRetry={onRetry} />
  return (
    <>
      <VpsBlock host={state.report.host} now={now} />
      <ApiBlock api={state.report.api} />
      <LiveKitPart state={live} />
    </>
  )
}

/**
 * Aba Servidor do painel /observabilidade (id `servidor`): VPS, API e LiveKit.
 * Ver docs/OBSERVABILIDADE.md e docs/adr/0067-metricas-da-api-e-da-vps.md.
 */
export default function ServerTab({ days }: { days: number }): React.JSX.Element {
  const { state, reload } = useServerReport(days)
  const live = useLiveReport(days)
  const retry = (): void => {
    reload()
    live.reload()
  }
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ServerTabBody state={state} live={live.state} now={Date.now()} onRetry={retry} />
    </div>
  )
}
