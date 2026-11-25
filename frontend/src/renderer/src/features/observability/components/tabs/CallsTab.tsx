import { worstLists } from '../../lib/worstByKind'
import { LiveReportGate } from '../LiveReportGate'
import { WorstSessions } from '../WorstSessions'

/** Aba Chamadas: as piores sessões de voz das calls e o motivo provável. */
export default function CallsTab({ days }: { days: number }): React.JSX.Element {
  return (
    <LiveReportGate days={days}>
      {(report) => (
        <WorstSessions
          title="Piores chamadas e por quê"
          empty="Nenhuma chamada ruim no período."
          rows={worstLists(report).calls}
        />
      )}
    </LiveReportGate>
  )
}
