import Button from '../../../shared/ui/Button'
import { CheckIcon, XIcon } from '../../../shared/ui/icons'

/** Clicar na resposta que já está marcada tira a resposta (sem resposta = sem aviso). */
export function nextRsvp(current: boolean | null, clicked: boolean): boolean | null {
  return current === clicked ? null : clicked
}

/** "Vou" e "Não vou": uma resposta só, trocável a qualquer momento. */
export default function RsvpButtons({
  value,
  onChange,
  disabled = false
}: {
  value: boolean | null
  onChange: (next: boolean | null) => void
  disabled?: boolean
}): React.JSX.Element {
  return (
    <div role="group" aria-label="Você vai?" className="grid grid-cols-2 gap-2">
      <Button
        size="lg"
        icon={CheckIcon}
        variant={value === true ? 'success' : 'ghost'}
        aria-pressed={value === true}
        disabled={disabled}
        onClick={() => onChange(nextRsvp(value, true))}
      >
        Vou
      </Button>
      <Button
        size="lg"
        icon={XIcon}
        variant={value === false ? 'danger' : 'ghost'}
        aria-pressed={value === false}
        disabled={disabled}
        onClick={() => onChange(nextRsvp(value, false))}
      >
        Não vou
      </Button>
    </div>
  )
}
