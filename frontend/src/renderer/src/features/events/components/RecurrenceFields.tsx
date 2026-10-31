import Input from '../../../shared/ui/Input'
import type { EndMode, EventFormValues } from '../lib/eventForm'
import { RECURRENCE_OPTIONS, recurrenceLabel, type Recurrence } from '../lib/recurrence'

const END_OPTIONS: { value: EndMode; label: string }[] = [
  { value: 'never', label: 'Nunca' },
  { value: 'until', label: 'Em uma data' },
  { value: 'count', label: 'Depois de algumas vezes' }
]

const LABEL = 'flex flex-col gap-1.5 text-ds-sm font-medium text-secondary'

/** A frase da regra ("Toda quarta-feira"), a partir do dia do início escolhido. */
function ruleSummary(values: EventFormValues): string | null {
  const start = new Date(values.startsAt)
  return Number.isNaN(start.getTime()) ? null : recurrenceLabel(values.recurrence, start)
}

/** Repetição do evento: a regra e, se repete, até quando. */
export default function RecurrenceFields({
  values,
  onChange,
  disabled = false
}: {
  values: EventFormValues
  onChange: (patch: Partial<EventFormValues>) => void
  disabled?: boolean
}): React.JSX.Element {
  const repeats = values.recurrence !== 'none'
  const summary = repeats ? ruleSummary(values) : null
  return (
    <fieldset className="flex flex-col gap-3">
      <label className={LABEL}>
        Repetir
        <select
          name="event-recurrence"
          disabled={disabled}
          className="glass-input"
          value={values.recurrence}
          onChange={(e) => onChange({ recurrence: e.target.value as Recurrence })}
        >
          {RECURRENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-floating">
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {summary && <p className="text-ds-xs text-muted">{summary}</p>}
      {repeats && (
        <label className={LABEL}>
          Termina
          <select
            name="event-end-mode"
            disabled={disabled}
            className="glass-input"
            value={values.endMode}
            onChange={(e) => onChange({ endMode: e.target.value as EndMode })}
          >
            {END_OPTIONS.map((o) => (
              <option key={o.value} value={o.value} className="bg-floating">
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {repeats && values.endMode === 'until' && (
        <Input
          label="Último dia"
          name="event-until"
          disabled={disabled}
          type="date"
          value={values.until}
          onChange={(e) => onChange({ until: e.target.value })}
        />
      )}
      {repeats && values.endMode === 'count' && (
        <Input
          label="Número de vezes"
          name="event-count"
          disabled={disabled}
          type="number"
          min={1}
          inputMode="numeric"
          value={values.count}
          onChange={(e) => onChange({ count: e.target.value })}
        />
      )}
    </fieldset>
  )
}
