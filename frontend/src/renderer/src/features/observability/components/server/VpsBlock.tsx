import type { ServerReport } from '../../api/serverReport'
import { numberLabel } from '../../lib/reportFormat'
import { ageLabel, bytesLabel, hostSummary, isStale, mbps } from '../../lib/serverHealth'
import { timeLabel } from '../../lib/timeLabel'
import { LineChart } from '../LineChart'
import { Empty, Panel, ScrollTable } from '../Panel'
import { ChartGrid, LastCollected, StatTile, TileGrid } from './StatTile'

const pct = (v: number | null | undefined): string => `${numberLabel(v, 0)}%`

function VpsTiles({ host, now }: { host: ServerReport['host']; now: number }): React.JSX.Element {
  const latest = host.latest
  const s = hostSummary(host, now)
  return (
    <TileGrid>
      <StatTile
        label="CPU agora"
        value={pct(latest?.cpu_pct)}
        hint={`pico ${pct(s.cpuPeak)}`}
        warn={s.warn.cpu}
      />
      <StatTile
        label="Steal (pico)"
        value={pct(s.stealPeak)}
        hint="CPU tomada por outras VPS"
        warn={s.warn.steal}
      />
      <StatTile
        label="RAM usada"
        value={pct(latest?.mem_used_pct)}
        hint={`swap ${numberLabel(latest?.swap_used_mb, 0)} MB`}
        warn={s.warn.memory}
      />
      <StatTile
        label="Disco usado"
        value={pct(latest?.disk_used_pct)}
        hint={`${bytesLabel(latest?.disk_free_bytes)} livres`}
        warn={s.warn.disk}
      />
      <StatTile
        label="Rede agora"
        value={`${numberLabel(mbps(latest?.net_tx_bps ?? null))} Mbps`}
        hint={`saindo; entrando ${numberLabel(mbps(latest?.net_rx_bps ?? null))} Mbps`}
      />
      <StatTile
        label="Último backup"
        value={ageLabel(latest?.backup_at ?? null, now)}
        hint={latest?.backup_at ? bytesLabel(latest.backup_bytes) : 'nenhum backup encontrado'}
        warn={s.warn.backup}
      />
      <StatTile
        label="Ligada desde"
        value={latest?.boot_at ? timeLabel(latest.boot_at) : '—'}
        hint={`carga ${numberLabel(latest?.load1, 2)}`}
      />
      <StatTile
        label="Banco"
        value={bytesLabel(latest?.db_size_bytes)}
        hint={`${numberLabel(latest?.db_connections, 0)} conexões`}
      />
    </TileGrid>
  )
}

function VpsCharts({ series }: { series: ServerReport['host']['series'] }): React.JSX.Element {
  const times = series.map((p) => p.at)
  return (
    <ChartGrid>
      <LineChart
        title="CPU da VPS"
        unit="%"
        times={times}
        series={[
          { label: 'Uso', values: series.map((p) => p.cpu_pct), slot: 1 },
          { label: 'Steal (pior minuto)', values: series.map((p) => p.steal_pct), slot: 2 }
        ]}
      />
      <LineChart
        title="Memória"
        unit="%"
        times={times}
        series={[
          { label: 'RAM usada', values: series.map((p) => p.mem_used_pct), slot: 1 },
          { label: 'Disco usado', values: series.map((p) => p.disk_used_pct), slot: 2 }
        ]}
      />
      <LineChart
        title="Rede"
        unit="Mbps"
        times={times}
        series={[
          { label: 'Saída', values: series.map((p) => mbps(p.net_tx_bps)), slot: 1 },
          { label: 'Entrada', values: series.map((p) => mbps(p.net_rx_bps)), slot: 2 }
        ]}
      />
      <LineChart
        title="CPU dos processos"
        unit="%"
        times={times}
        series={[
          { label: 'Backend', values: series.map((p) => p.backend_cpu_pct), slot: 1 },
          { label: 'Postgres', values: series.map((p) => p.postgres_cpu_pct), slot: 2 }
        ]}
      />
    </ChartGrid>
  )
}

function TablesTable({
  tables
}: {
  tables: ServerReport['host']['tables']
}): React.JSX.Element | null {
  if (!tables.length) return null
  return (
    <ScrollTable head={['Maiores tabelas', 'Tamanho']}>
      {tables.map((t) => (
        <tr key={t.name}>
          <td>{t.name}</td>
          <td>{bytesLabel(t.bytes)}</td>
        </tr>
      ))}
    </ScrollTable>
  )
}

/** A máquina: CPU (com steal), RAM e swap, disco, rede, backup, boot e banco. */
export function VpsBlock({
  host,
  now
}: {
  host: ServerReport['host']
  now: number
}): React.JSX.Element {
  return (
    <Panel title="VPS">
      {host.latest ? (
        <>
          <LastCollected minute={host.latest.minute} stale={isStale(host.latest.minute, now)} />
          <VpsTiles host={host} now={now} />
          <VpsCharts series={host.series} />
          <TablesTable tables={host.tables} />
        </>
      ) : (
        <Empty>Sem métricas da VPS no período.</Empty>
      )}
    </Panel>
  )
}
