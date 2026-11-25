import { BreakdownTables } from '../BreakdownTables'
import { LiveReportGate } from '../LiveReportGate'

/** Aba Distribuição: as sessões por sistema, placa, codec, conexão, plataforma, rede e aparelho. */
export default function BreakdownTab({ days }: { days: number }): React.JSX.Element {
  return (
    <LiveReportGate days={days}>
      {(report) => <BreakdownTables breakdown={report.breakdown} />}
    </LiveReportGate>
  )
}
