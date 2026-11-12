import { useSyncExternalStore } from 'react'
import { clockFor } from '../lib/clock'

/** Hora atual que se atualiza a cada `intervalMs`, num relógio único compartilhado por todos os usos. */
export function useNow(intervalMs: number): number {
  const clock = clockFor(intervalMs)
  return useSyncExternalStore(clock.subscribe, clock.getSnapshot, clock.getSnapshot)
}
