import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { averagePing, pingSegments, type PingSample } from '../lib/connectionStats'
import { useConnectionStats } from '../hooks/useConnectionStats'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { insideAny } from '../../../shared/lib/dismiss'

const WIDTH = 300
const MARGIN = 8
const timeFormat = new Intl.DateTimeFormat('pt-BR', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit'
})
const decimalFormat = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })

function formatPing(ms: number | null): string {
  return ms === null ? 'Sem dados' : `${Math.round(ms)} ms`
}

function PingGraph({
  history,
  ceiling,
  pending
}: {
  history: PingSample[]
  ceiling: number
  pending: boolean
}): React.JSX.Element {
  const latest = history.at(-1)
  const segments = pingSegments(history, ceiling)
  const color =
    latest?.ms == null
      ? 'var(--text-muted)'
      : latest.ms < 100
        ? 'var(--green)'
        : latest.ms < 250
          ? 'var(--yellow)'
          : 'var(--red)'
  const end = latest?.time

  return (
    <div>
      <div className="relative rounded border border-subtle bg-input px-2 py-3">
        <svg
          viewBox="0 0 240 72"
          className="block h-20 w-full overflow-visible"
          role="img"
          aria-label={`Histórico de latência até o servidor de voz. Último ping: ${formatPing(latest?.ms ?? null)}. Escala de 0 a ${ceiling} ms.`}
        >
          {[0, 24, 48, 72].map((y) => (
            <line
              key={`h${y}`}
              x1="0"
              x2="240"
              y1={y}
              y2={y}
              style={{ stroke: 'var(--fg)' }}
              strokeOpacity="0.12"
            />
          ))}
          {[0, 60, 120, 180, 240].map((x) => (
            <line
              key={`v${x}`}
              x1={x}
              x2={x}
              y1="0"
              y2="72"
              style={{ stroke: 'var(--fg)' }}
              strokeOpacity="0.12"
            />
          ))}
          {[ceiling, ceiling / 2, 0].map((value, index) => (
            <text
              key={index}
              x="237"
              y={index * 36 + (index === 0 ? 9 : -3)}
              textAnchor="end"
              style={{ fill: 'var(--text-muted)' }}
              fontSize="9"
            >
              {Math.round(value)}
            </text>
          ))}
          {segments.map((points, index) => (
            <polyline
              key={index}
              points={points}
              fill="none"
              style={{ stroke: color }}
              strokeWidth="1.5"
              strokeLinejoin="round"
            />
          ))}
          {latest?.ms != null && (
            <circle
              cx="240"
              cy={72 - (Math.min(latest.ms, ceiling) / ceiling) * 72}
              r="2"
              style={{ fill: color }}
            />
          )}
        </svg>
        {!segments.length && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-ds-xs text-gray-400">
            {pending ? 'Medindo…' : 'Sem dados de latência'}
          </span>
        )}
      </div>
      <div
        className="mt-1 flex justify-between text-[10px] tabular-nums text-gray-400"
        aria-hidden="true"
      >
        {end ? (
          [end - 58000, end - 29000, end].map((time) => (
            <span key={time}>{timeFormat.format(time)}</span>
          ))
        ) : (
          <span>Último minuto · ms</span>
        )}
      </div>
    </div>
  )
}

function ConnectionStatsPopover({
  anchor,
  onClose
}: {
  anchor: HTMLElement
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const stats = useConnectionStats()
  // Reposiciona também quando a janela muda, sem um observador permanente.
  const [, resize] = useState(0)
  const rect = anchor.getBoundingClientRect()
  const width = Math.min(WIDTH, window.innerWidth - MARGIN * 2)
  const left = Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN))
  const bottom = window.innerHeight - rect.top + MARGIN

  useDismiss(
    (target) => insideAny([ref.current, anchor], target),
    (reason, event) => {
      if (reason === 'outside') return onClose()
      event.preventDefault()
      event.stopPropagation()
      onClose()
      anchor.focus({ preventScroll: true })
    },
    { event: 'pointerdown' }
  )

  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    const onResize = (): void => resize((value) => value + 1)
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  }, [])

  const latest = stats.history.at(-1)?.ms ?? null
  const metricsAvailable = Boolean(window.api?.appMetrics)
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      style={{ width, left, bottom, maxHeight: Math.max(80, rect.top - MARGIN * 2) }}
      className="fixed z-50 overflow-y-auto rounded-xl border border-subtle bg-floating shadow-2xl outline-none"
    >
      <h2
        id={titleId}
        className="border-b border-subtle px-4 py-3 text-center text-ds-xs font-bold uppercase tracking-wide text-gray-200"
      >
        Conexão de voz
      </h2>
      <div className="space-y-3 p-4">
        <PingGraph history={stats.history} ceiling={stats.ceiling} pending={stats.pending} />
        <dl className="space-y-1 text-ds-sm text-gray-400">
          <div className="flex items-center justify-between gap-2">
            <dt>Ping médio</dt>
            <dd className="font-semibold tabular-nums text-gray-200">
              {stats.pending ? 'Medindo…' : formatPing(averagePing(stats.history))}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-2">
            <dt>Último ping</dt>
            <dd className="font-semibold tabular-nums text-gray-200">
              {stats.pending ? 'Medindo…' : formatPing(latest)}
            </dd>
          </div>
        </dl>
        <p className="text-ds-xs text-gray-500">Latência até o servidor de voz.</p>
        <div className="border-t border-subtle pt-3">
          <h3 className="mb-2 text-ds-xs font-bold text-gray-400">Uso do aplicativo</h3>
          {metricsAvailable ? (
            <dl className="grid grid-cols-2 gap-3 text-ds-sm">
              <div title="Estimativa da memória residente dos processos do aplicativo; pode incluir memória compartilhada.">
                <dt className="text-ds-xs text-gray-400">
                  RAM <span className="font-normal">(estimada)</span>
                </dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-gray-200">
                  {stats.metrics?.memoryMB != null
                    ? `${Math.round(stats.metrics.memoryMB)} MB`
                    : stats.pending
                      ? 'Medindo…'
                      : 'Indisponível'}
                </dd>
              </div>
              <div title="Uso dos processos do aplicativo em relação à capacidade total da CPU.">
                <dt className="text-ds-xs text-gray-400">CPU</dt>
                <dd className="mt-0.5 font-semibold tabular-nums text-gray-200">
                  {stats.metrics?.cpuPercent != null
                    ? `${decimalFormat.format(stats.metrics.cpuPercent)}%`
                    : stats.pending || stats.warmingCPU
                      ? 'Medindo…'
                      : 'Indisponível'}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-ds-xs text-gray-400">
              Métricas de recursos disponíveis no aplicativo desktop.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ConnectionStatsPopover
