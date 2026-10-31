import type { ServerEvent } from '../api/events'

/**
 * O evento já começou (a ocorrência atual): só título, descrição e banner mudam
 * (o servidor confere de novo). Vale até a ocorrência avançar.
 */
export function isRunning(event: Pick<ServerEvent, 'next_start_at'>, now: Date = new Date()): boolean {
  return now.getTime() >= Date.parse(event.next_start_at)
}
