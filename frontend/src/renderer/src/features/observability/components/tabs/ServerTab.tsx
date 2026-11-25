import { LiveReportGate } from '../LiveReportGate'
import { ServerSection } from '../ServerSection'

/** Aba Servidor: banda, CPU e carga do LiveKit e da VPS. */
export default function ServerTab({ days }: { days: number }): React.JSX.Element {
  return (
    <LiveReportGate days={days}>
      {(report) => <ServerSection points={report.server} />}
    </LiveReportGate>
  )
}
