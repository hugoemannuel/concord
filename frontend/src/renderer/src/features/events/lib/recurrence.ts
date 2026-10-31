// Regras de repetição do evento (as mesmas de backend/internal/event/recurrence.go).

export type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly'

export const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'none', label: 'Não repete' },
  { value: 'daily', label: 'Todo dia' },
  { value: 'weekly', label: 'Toda semana' },
  { value: 'monthly', label: 'Todo mês' }
]

// Domingo = 0, como Date.getDay(). "Todo" para sábado e domingo, "Toda" para os -feira.
const WEEKDAYS = [
  'Todo domingo',
  'Toda segunda-feira',
  'Toda terça-feira',
  'Toda quarta-feira',
  'Toda quinta-feira',
  'Toda sexta-feira',
  'Todo sábado'
]

/** O mês que não tem o dia 29, 30 ou 31 usa o último dia (o servidor faz o mesmo). */
const LAST_DAY_NOTE = ' (nos meses mais curtos, no último dia)'

/** Texto da repetição para o cartão e o formulário, a partir da data de início. */
export function recurrenceLabel(rule: Recurrence, startsAt: Date): string {
  switch (rule) {
    case 'daily':
      return 'Todo dia'
    case 'weekly':
      return WEEKDAYS[startsAt.getDay()]
    case 'monthly': {
      const day = startsAt.getDate()
      return `Todo dia ${day} do mês${day > 28 ? LAST_DAY_NOTE : ''}`
    }
    default:
      return 'Não repete'
  }
}
