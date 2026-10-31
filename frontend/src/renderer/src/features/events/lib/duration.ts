// Duração do evento: a sala de voz e de texto dele fecha quando ela acaba. As
// mesmas durações que o servidor aceita (backend/internal/event/model.go).

export const DEFAULT_DURATION = 120

export const DURATION_OPTIONS: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 minutos' },
  { minutes: 60, label: '1 hora' },
  { minutes: 120, label: '2 horas' },
  { minutes: 180, label: '3 horas' },
  { minutes: 240, label: '4 horas' }
]

/** A duração por extenso ("2 horas"); valor fora da lista sai em minutos. */
export function durationLabel(minutes: number): string {
  return DURATION_OPTIONS.find((o) => o.minutes === minutes)?.label ?? `${minutes} minutos`
}
