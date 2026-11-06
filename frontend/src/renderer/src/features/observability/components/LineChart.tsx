import { timeLabel } from '../lib/timeLabel'
import { useState } from 'react'
import { chartPath, nearestIndex, niceMax, numberLabel } from '../lib/reportFormat'
import './liveChart.css'

export interface ChartSeries {
  label: string
  values: (number | null)[]
  /** 1 ou 2: a cor da série (--viz-1/--viz-2). */
  slot: 1 | 2
}

interface Props {
  title: string
  unit: string
  times: string[]
  series: ChartSeries[]
}

const W = 600
const H = 160

function Legend({
  series,
  index,
  unit
}: {
  series: ChartSeries[]
  index: number
  unit: string
}): React.JSX.Element {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-ds-sm text-gray-300">
      {series.map((s) => (
        <li key={s.label} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-0.5 w-4 rounded"
            style={{ background: `var(--viz-${s.slot})` }}
          />
          {s.label}
          {index >= 0 && (
            <span className="text-strong tabular-nums">
              {numberLabel(s.values[index])} {unit}
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/**
 * Linhas no tempo, um eixo só (duas medidas de escala diferente = dois
 * gráficos). Passar o dedo/mouse mostra os valores do ponto na legenda.
 */
export function LineChart({ title, unit, times, series }: Props): React.JSX.Element {
  const [hover, setHover] = useState(-1)
  const max = niceMax(series.flatMap((s) => s.values))
  const onMove = (e: React.PointerEvent<SVGSVGElement>): void => {
    const box = e.currentTarget.getBoundingClientRect()
    setHover(nearestIndex(((e.clientX - box.left) / box.width) * W, W, times.length))
  }
  const x = hover >= 0 && times.length > 1 ? (hover / (times.length - 1)) * W : null
  return (
    <figure className="live-chart flex min-w-0 flex-col gap-2 rounded-lg bg-surface p-3">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-ds-md font-medium text-strong">{title}</span>
        <span className="text-ds-sm text-gray-400">
          {hover >= 0 ? timeLabel(times[hover]) : `até ${numberLabel(max, 1)} ${unit}`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-40 w-full touch-none"
        role="img"
        aria-label={title}
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setHover(-1)}
      >
        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1={0}
            x2={W}
            y1={H * f}
            y2={H * f}
            stroke="currentColor"
            className="text-fg/10"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {series.map((s) => (
          <path
            key={s.label}
            d={chartPath(s.values, W, H, max)}
            fill="none"
            stroke={`var(--viz-${s.slot})`}
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {x !== null && (
          <line
            x1={x}
            x2={x}
            y1={0}
            y2={H}
            stroke="currentColor"
            className="text-fg/40"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      <Legend series={series} index={hover} unit={unit} />
    </figure>
  )
}
