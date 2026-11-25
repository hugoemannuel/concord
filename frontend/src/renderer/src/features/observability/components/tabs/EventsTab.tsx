import { LiveReportGate } from '../LiveReportGate'
import { RecentEvents } from '../RecentEvents'

/**
 * Aba Eventos: as quedas e falhas da voz do período inteiro (poucas, e somem
 * atrás dos congelamentos na lista dos últimos) e o que aconteceu por último.
 */
export default function EventsTab({ days }: { days: number }): React.JSX.Element {
  return (
    <LiveReportGate days={days}>
      {(report) => (
        <>
          {report.call_events && (
            <RecentEvents
              title="Quedas e falhas da voz (período inteiro)"
              empty="Nenhuma queda ou falha de voz no período."
              events={report.call_events}
            />
          )}
          <RecentEvents events={report.events} />
        </>
      )}
    </LiveReportGate>
  )
}
