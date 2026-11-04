import {
  MAX_BIO,
  MAX_DISPLAY_NAME,
  MAX_PRONOUNS,
  MAX_STATUS_TEXT,
  charCount
} from '../../../profile/lib/profileValidation'
import { Field, inputClass } from './ProfileField'

interface TextProps {
  value: string
  error?: string
  onChange: (value: string) => void
}

export function DisplayNameField({
  value,
  error,
  disabled,
  onChange
}: TextProps & { disabled?: boolean }): React.JSX.Element {
  return (
    <Field
      label="Nome de exibição"
      error={error}
      counter={{ used: charCount(value), max: MAX_DISPLAY_NAME }}
    >
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputClass} disabled:cursor-not-allowed disabled:opacity-60`}
        aria-label="Nome de exibição"
      />
      {disabled && (
        <p className="mt-1 text-ds-xs text-muted">
          Você não tem permissão para mudar seu nome neste servidor. O estilo pode mudar.
        </p>
      )}
    </Field>
  )
}

export function PronounsField({ value, error, onChange }: TextProps): React.JSX.Element {
  return (
    <Field label="Pronomes" error={error} counter={{ used: charCount(value), max: MAX_PRONOUNS }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Adicione seus pronomes"
        className={inputClass}
        aria-label="Pronomes"
      />
    </Field>
  )
}

export function NoteField({ value, error, onChange }: TextProps): React.JSX.Element {
  return (
    <Field
      label="Nota"
      hint="O balão que aparece ao lado da sua foto."
      error={error}
      counter={{ used: charCount(value), max: MAX_STATUS_TEXT }}
    >
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="No que você está pensando?"
        className={inputClass}
        aria-label="Nota"
      />
    </Field>
  )
}

export function BioField({ value, error, onChange }: TextProps): React.JSX.Element {
  return (
    <Field
      label="Sobre mim"
      hint="Você pode usar links."
      error={error}
      counter={{ used: charCount(value), max: MAX_BIO }}
    >
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={`${inputClass} resize-none`}
        aria-label="Sobre mim"
      />
    </Field>
  )
}
