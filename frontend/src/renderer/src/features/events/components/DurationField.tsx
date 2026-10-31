import { DURATION_OPTIONS } from '../lib/duration'

/** Quanto o evento dura: quando acaba, a sala própria dele (voz e texto) é apagada. */
export default function DurationField({
  value,
  onChange,
  disabled = false
}: {
  value: number
  onChange: (minutes: number) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5 text-ds-sm font-medium text-secondary">
        Duração
        <select
          name="event-duration"
          disabled={disabled}
          className="glass-input"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        >
          {DURATION_OPTIONS.map((o) => (
            <option key={o.minutes} value={o.minutes} className="bg-floating">
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-ds-xs text-muted">
        A sala de voz e a de texto do evento abrem na hora de começar e são apagadas quando a duração
        acaba; só quem confirmar presença entra.
      </p>
    </div>
  )
}
