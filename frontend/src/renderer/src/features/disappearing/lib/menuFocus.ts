import { nextMenuIndex } from '../../../shared/lib/menuNav'
import { DISAPPEARING_OPTIONS, type DisappearingSeconds } from './disappearing'

/** Índice da opção marcada (a que recebe o foco ao abrir o menu). */
export function checkedOptionIndex(current: DisappearingSeconds | null): number {
  return Math.max(
    0,
    DISAPPEARING_OPTIONS.findIndex((o) => o.seconds === current)
  )
}

/** Roving tabindex do radiogroup: só a opção marcada é parada do Tab. */
export function optionTabIndex(index: number, checked: number): 0 | -1 {
  return index === checked ? 0 : -1
}

/** Opção que a tecla (seta, Home, End) leva o foco, ou null se a tecla não navega. */
export function keyTarget<T>(items: readonly T[], active: unknown, key: string): T | null {
  const next = nextMenuIndex(items.indexOf(active as T), items.length, key)
  return next === null ? null : (items[next] ?? null)
}
