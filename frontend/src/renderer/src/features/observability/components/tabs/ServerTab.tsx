import { useServerReport } from '../../hooks/useServerReport'
import { CollectionGaps } from '../CollectionGaps'
import { LiveReportGate } from '../LiveReportGate'
import { ServerSection } from '../ServerSection'
import { ServerMetrics } from '../server/ServerMetrics'

/**
 * Aba Servidor: a VPS e a API (GET /obs/server, ADR 0067) e o LiveKit (a série
 * do relatório das lives). Quem não é dev vê só o aviso, uma vez.
 */
export default function ServerTab({ days }: { days: number }): React.JSX.Element {
  const { state, reload } = useServerReport(days)
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <ServerMetrics state={state} now={Date.now()} onRetry={reload} />
      {state.status !== 'forbidden' && (
        <LiveReportGate days={days}>
          {(report) => (
            <>
              <ServerSection points={report.server} />
              <CollectionGaps gaps={report.collection_gaps} restarts={report.livekit_restarts} />
            </>
          )}
        </LiveReportGate>
      )}
    </div>
  )
}
