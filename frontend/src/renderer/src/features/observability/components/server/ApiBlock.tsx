import type { ServerReport } from '../../api/serverReport'
import { numberLabel } from '../../lib/reportFormat'
import { apiSummary } from '../../lib/serverHealth'
import { LineChart } from '../LineChart'
import { Empty, Panel, ScrollTable } from '../Panel'
import { ChartGrid, StatTile, TileGrid } from './StatTile'

const ms = (v: number | null | undefined): string => `${numberLabel(v, 0)} ms`

function ApiTiles({ api }: { api: ServerReport['api'] }): React.JSX.Element {
  const s = apiSummary(api)
  const latest = api.latest
  return (
    <TileGrid>
      <StatTile
        label="Pedidos por minuto"
        value={numberLabel(s.perMinute, 0)}
        hint="média no período"
      />
      <StatTile
        label="Erros 5xx"
        value={String(s.errors5xx)}
        hint="no período"
        warn={s.errors5xx > 0}
      />
      <StatTile label="p95 (pior)" value={ms(s.worstP95)} hint="latência" />
      <StatTile label="Panics" value={String(s.panics)} hint="no período" warn={s.panics > 0} />
      <StatTile label="WebSockets abertos" value={numberLabel(latest?.ws_open, 0)} hint="agora" />
      <StatTile
        label="Pool do banco"
        value={latest ? `${latest.db_in_use} de ${latest.db_max}` : '—'}
        hint={`${s.dbWaits} esperas por conexão`}
        warn={s.dbWaits > 0}
      />
      <StatTile label="Goroutines" value={numberLabel(latest?.goroutines, 0)} hint="agora" />
      <StatTile
        label="Memória do Go"
        value={`${numberLabel(latest?.heap_mb, 0)} MB`}
        hint="heap em uso"
      />
    </TileGrid>
  )
}

function ApiCharts({ series }: { series: ServerReport['api']['series'] }): React.JSX.Element {
  const times = series.map((p) => p.at)
  const perMinute = (pick: (p: (typeof series)[number]) => number): (number | null)[] =>
    series.map((p) => (p.minutes ? pick(p) / p.minutes : null))
  return (
    <ChartGrid>
      <LineChart
        title="Pedidos por minuto"
        unit="/min"
        times={times}
        series={[{ label: 'Pedidos', values: perMinute((p) => p.requests), slot: 1 }]}
      />
      <LineChart
        title="Erros por minuto"
        unit="/min"
        times={times}
        series={[
          { label: '5xx', values: perMinute((p) => p.status_5xx), slot: 2 },
          { label: '4xx', values: perMinute((p) => p.status_4xx), slot: 1 }
        ]}
      />
      <LineChart
        title="Latência"
        unit="ms"
        times={times}
        series={[
          { label: 'p50', values: series.map((p) => p.p50_ms), slot: 1 },
          { label: 'p95 (pior minuto)', values: series.map((p) => p.p95_ms), slot: 2 }
        ]}
      />
      <LineChart
        title="Conexões"
        unit=""
        times={times}
        series={[
          { label: 'WebSockets abertos', values: series.map((p) => p.ws_open), slot: 1 },
          { label: 'Banco em uso', values: series.map((p) => p.db_in_use), slot: 2 }
        ]}
      />
    </ChartGrid>
  )
}

function RoutesTable({ routes }: { routes: ServerReport['api']['routes'] }): React.JSX.Element {
  if (!routes.length) return <Empty>Nenhuma rota chamada no período.</Empty>
  return (
    <ScrollTable head={['Rota', 'Pedidos', '5xx', '4xx', 'Média', 'p95', 'Máx', 'Tempo total']}>
      {routes.map((r) => (
        <tr key={r.route}>
          <td className="font-mono">{r.route}</td>
          <td>{r.requests}</td>
          <td className={r.status_5xx > 0 ? 'text-danger' : undefined}>{r.status_5xx}</td>
          <td>{r.status_4xx}</td>
          <td>{ms(r.avg_ms)}</td>
          <td>{ms(r.p95_ms)}</td>
          <td>{ms(r.max_ms)}</td>
          <td>{numberLabel(r.total_ms / 1000, 1)} s</td>
        </tr>
      ))}
    </ScrollTable>
  )
}

/** A API: pedidos, 5xx, latência, rotas mais lentas e com erro, conexões, pool e panics. */
export function ApiBlock({ api }: { api: ServerReport['api'] }): React.JSX.Element {
  return (
    <Panel title="API">
      {api.latest ? (
        <>
          <ApiTiles api={api} />
          <ApiCharts series={api.series} />
          <RoutesTable routes={api.routes} />
        </>
      ) : (
        <Empty>Sem métricas da API no período.</Empty>
      )}
    </Panel>
  )
}
