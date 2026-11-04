/**
 * Contexto de canvas falso para os testes das cenas (rodam sem DOM): conta
 * as chamadas de cada método e devolve um "gradiente" onde o código pedir um.
 */
export function fakeCtx(): { ctx: CanvasRenderingContext2D; calls: Record<string, number> } {
  const calls: Record<string, number> = {}
  const gradient = { addColorStop: (): void => {} }
  const target: Record<string, unknown> = {}
  const ctx = new Proxy(target, {
    get: (t, key: string) =>
      key in t
        ? t[key]
        : (): unknown => {
            calls[key] = (calls[key] ?? 0) + 1
            return gradient
          },
    set: (t, key: string, value) => {
      t[key] = value
      return true
    }
  }) as unknown as CanvasRenderingContext2D
  return { ctx, calls }
}
