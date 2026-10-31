import { MAX_REMINDERS, REMINDER_OPTIONS, canPickReminder, toggleReminder } from '../lib/reminders'

/** Escolhe até duas antecedências para os avisos do Salinha Bot (a da hora de começar sempre sai). */
export default function ReminderPicker({
  selected,
  onChange,
  disabled: locked = false
}: {
  selected: number[]
  onChange: (next: number[]) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-ds-sm font-medium text-secondary">
        {`Avisar antes (até ${MAX_REMINDERS})`}
      </legend>
      <div className="flex flex-wrap gap-2">
        {REMINDER_OPTIONS.map(({ minutes, label }) => {
          const disabled = locked || !canPickReminder(selected, minutes)
          return (
            <label
              key={minutes}
              className={`flex min-h-11 items-center gap-2 rounded-lg border border-subtle px-3 text-ds-sm text-normal ${
                disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer hover:bg-fg/5'
              }`}
            >
              <input
                type="checkbox"
                checked={selected.includes(minutes)}
                disabled={disabled}
                onChange={() => onChange(toggleReminder(selected, minutes))}
                className="h-4 w-4 accent-brand"
              />
              {label}
            </label>
          )
        })}
      </div>
      <p className="text-ds-xs text-muted">O aviso na hora de começar sempre é enviado.</p>
    </fieldset>
  )
}
