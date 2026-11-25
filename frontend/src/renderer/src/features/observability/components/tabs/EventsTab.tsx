import { LiveReportGate } from '../LiveReportGate'
import { RecentEvents } from '../RecentEvents'

/** Aba Eventos: o que aconteceu nas lives e calls (qualidade caiu, reconexões...). */
export default function EventsTab({ days }: { days: number }): React.JSX.Element {
  return (
    <LiveReportGate days={days}>
      {(report) => <RecentEvents events={report.events} />}
    </LiveReportGate>
  )
}
