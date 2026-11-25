// Quanto quem assiste espera pelo primeiro quadro (telemetria, docs/adr/0074):
// do "assistir" (a lista de lives assistidas que o CallMedia recebe) ao
// primeiro quadro pronto no <video> (loadeddata). A telemetria leva na 1ª
// amostra da sessão. Fora do callStore.

/** Acima disso a live só apareceu na tela depois (miniatura fechada, outra aba). */
const MAX_MS = 60_000

let watched = new Set<string>()
const started = new Map<string, number>()
const measured = new Map<string, number>()

/** As lives que estou assistindo agora: quem entrou começa a contar. */
export function noteWatchedScreens(userIds: string[], now = performance.now()): void {
  const next = new Set(userIds)
  for (const id of next) if (!watched.has(id)) started.set(id, now)
  for (const id of watched) if (!next.has(id)) started.delete(id)
  watched = next
}

/** O <video> da live dessa pessoa mostrou o primeiro quadro. */
export function noteFirstFrame(userId: string, now = performance.now()): void {
  const start = started.get(userId)
  if (start === undefined) return
  started.delete(userId)
  const ms = now - start
  if (ms >= 0 && ms <= MAX_MS) measured.set(userId, Math.round(ms))
}

export function takeFirstFrame(userId: string): number | null {
  const ms = measured.get(userId) ?? null
  measured.delete(userId)
  return ms
}
