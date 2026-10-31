// Antecedências dos avisos do Salinha Bot (as mesmas que o servidor aceita em
// backend/internal/event/model.go). O aviso na hora de começar é sempre enviado
// e não aparece aqui.

export const MAX_REMINDERS = 2

export const DEFAULT_REMINDERS: number[] = [10, 5]

export const REMINDER_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 1440, label: '1 dia antes' },
  { minutes: 60, label: '1 hora antes' },
  { minutes: 30, label: '30 minutos antes' },
  { minutes: 15, label: '15 minutos antes' },
  { minutes: 10, label: '10 minutos antes' },
  { minutes: 5, label: '5 minutos antes' }
]

/** Marca ou desmarca uma antecedência; a lista fica do maior para o menor e nunca passa do limite. */
export function toggleReminder(selected: number[], minutes: number): number[] {
  if (selected.includes(minutes)) return selected.filter((m) => m !== minutes)
  if (selected.length >= MAX_REMINDERS) return selected
  return [...selected, minutes].sort((a, b) => b - a)
}

/** Desmarcar sempre pode; marcar só enquanto há vaga. */
export function canPickReminder(selected: number[], minutes: number): boolean {
  return selected.includes(minutes) || selected.length < MAX_REMINDERS
}
