// A tela do erro pelo padrão da rota (os nomes dos arquivos do Expo Router), nunca
// pelos valores: `useSegments()` devolve ['(app)', 'canal', '[channelId]'].

const GROUP = /^\(.+\)$/
const CATCH_ALL = /^\[\.\.\.(\w+)\]$/
const DYNAMIC = /^\[(\w+)\]$/
const STATIC = /^[a-z][a-z0-9_-]*$/

function segmentPattern(segment: string): string {
  if (CATCH_ALL.test(segment)) return segment.replace(CATCH_ALL, '*$1')
  if (DYNAMIC.test(segment)) return segment.replace(DYNAMIC, ':$1')
  // Defesa: segmento que não é nome de rota (um valor real) não vai como veio.
  return STATIC.test(segment) ? segment : ':valor'
}

/** Tira os grupos `(app)`, `(tabs)`; `[id]` vira `:id`, `[...x]` vira `*x`. */
export function routePattern(segments: readonly string[]): string {
  return `/${segments.filter((s) => !GROUP.test(s)).map(segmentPattern).join('/')}`
}
