import { splitWorst } from '../../lib/worstByKind'
import { LiveReportGate } from '../LiveReportGate'
import { LivesTable } from '../LivesTable'
import { WorstSessions } from '../WorstSessions'

/** Aba Lives: as lives recentes e as piores sessões de live (quem transmite e quem assiste). */
export default function LivesTab({ days }: { days: number }): React.JSX.Element {
  return (
    <LiveReportGate days={days}>
      {(report) => (
        <>
          <LivesTable rows={report.lives} />
          <WorstSessions
            title="Piores lives e por quê"
            empty="Nenhuma live ruim no período."
            rows={splitWorst(report.worst).lives}
          />
        </>
      )}
    </LiveReportGate>
  )
}
