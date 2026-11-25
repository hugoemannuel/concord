import type { ServerPoint } from '../../api/observability'
import { numberLabel } from '../../lib/reportFormat'
import { serverSummary } from '../../lib/serverSummary'
import { LineChart } from '../LineChart'
import { Panel } from '../Panel'
import { ChartGrid, StatTile, TileGrid } from './StatTile'

/** O LiveKit (livekit_metrics, a mesma série da aba das lives). */
export function LiveKitBlock({ points }: { points: ServerPoint[] }): React.JSX.Element {
  const summary = serverSummary(points)
  const times = points.map((p) => p.at)
  const live = (pick: (p: ServerPoint) => number | null): (number | null)[] =>
    points.map((p) => (p.up ? pick(p) : null))
  return (
    <Panel title="LiveKit">
      {!summary.liveKitUp && (
        <p className="text-ds-sm text-warning">O LiveKit não mandou métricas no período.</p>
      )}
      <TileGrid>
        <StatTile label="Pico de saída" value={`${numberLabel(summary.peakMbpsOut)} Mbps`} />
        <StatTile label="Pico de pessoas" value={String(summary.peakParticipants)} />
        <StatTile label="Perda média na descida" value={`${numberLabel(summary.avgLossOut)}%`} />
        <StatTile label="Pico de CPU da VPS" value={`${numberLabel(summary.peakHostCpu, 0)}%`} />
      </TileGrid>
      <ChartGrid>
        <LineChart
          title="Banda do LiveKit"
          unit="Mbps"
          times={times}
          series={[
            { label: 'Saída', values: live((p) => p.mbps_out), slot: 1 },
            { label: 'Entrada', values: live((p) => p.mbps_in), slot: 2 }
          ]}
        />
        <LineChart
          title="CPU do LiveKit"
          unit="%"
          times={times}
          series={[
            { label: 'LiveKit (% de 1 vCPU)', values: live((p) => p.livekit_cpu_pct), slot: 1 }
          ]}
        />
      </ChartGrid>
    </Panel>
  )
}
