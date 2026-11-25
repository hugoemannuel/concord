import { PERIODS } from '../lib/panelRoute'

/** Seletor do período do painel (vale para todas as abas). */
export function PeriodPicker({
  days,
  onChange
}: {
  days: number
  onChange: (days: number) => void
}): React.JSX.Element {
  return (
    <div role="group" aria-label="Período" className="flex gap-1">
      {PERIODS.map((d) => (
        <button
          key={d}
          type="button"
          aria-pressed={d === days}
          onClick={() => onChange(d)}
          className={`focus-ring min-h-10 cursor-pointer rounded-md px-3 text-ds-sm font-medium transition-colors ${
            d === days ? 'bg-brand text-white' : 'bg-fg/10 text-gray-200 hover:bg-fg/15'
          }`}
        >
          {d === 1 ? '24 h' : `${d} dias`}
        </button>
      ))}
    </div>
  )
}
