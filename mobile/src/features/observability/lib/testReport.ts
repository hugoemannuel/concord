import type { StatsReport } from './statsFormat'

/** Relatório do getStats() nos testes: id → estatística (como o React Native entrega, um Map). */
export const statsReport = (stats: Record<string, Record<string, unknown>>): StatsReport =>
  new Map(Object.entries(stats).map(([id, s]) => [id, { id, ...s }]))
