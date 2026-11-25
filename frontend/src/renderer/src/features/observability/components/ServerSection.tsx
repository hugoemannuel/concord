import type { ServerPoint } from '../api/observability'
import { numberLabel } from '../lib/reportFormat'
import { serverSummary } from '../lib/serverSummary'
import { LineChart } from './LineChart'
import { Panel } from './Panel'

function Tile({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-surface p-3">
      <span className="text-ds-sm text-gray-400">{label}</span>
      <span className="text-lg font-semibold tabular-nums text-strong">{value}</span>
    </div>
  )
}

/** Banda, CPU e carga do LiveKit/VPS no período (livekit_metrics). */
export function ServerSection({ points }: { points: ServerPoint[] }): React.JSX.Element {
  const summary = serverSummary(points)
  const times = points.map((p) => p.at)
  const live = (pick: (p: ServerPoint) => number | null): (number | null)[] =>
    points.map((p) => (p.up ? pick(p) : null))
  return (
    <Panel title="LiveKit">
      {!summary.liveKitUp && (
        <p className="text-ds-sm text-warning">
          O LiveKit não mandou métricas no período (falta o deploy com --infra?). A CPU da VPS
          aparece mesmo assim.
        </p>
      )}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Tile label="Pico de saída" value={`${numberLabel(summary.peakMbpsOut)} Mbps`} />
        <Tile label="Pico de pessoas" value={String(summary.peakParticipants)} />
        <Tile label="Pico de CPU da VPS" value={`${numberLabel(summary.peakHostCpu, 0)}%`} />
        <Tile label="Perda média na descida" value={`${numberLabel(summary.avgLossOut)}%`} />
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
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
          title="CPU"
          unit="%"
          times={times}
          series={[
            { label: 'VPS inteira', values: points.map((p) => p.host_cpu_pct), slot: 1 },
            { label: 'LiveKit (% de 1 vCPU)', values: live((p) => p.livekit_cpu_pct), slot: 2 }
          ]}
        />
      </div>
    </Panel>
  )
}
