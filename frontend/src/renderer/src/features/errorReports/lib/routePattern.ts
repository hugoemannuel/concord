// Tela do erro sem ids (docs/adr/0068): "/servers/<uuid>/channels/<uuid>" vira
// "/servers/:id/channels/:id". O primeiro segmento é o nome da tela; depois
// dele só ficam as palavras fixas das rotas (app/router.tsx), o resto vira
// ":id" (id, código de convite, token de visitante...). Sem query nem hash.

/** Palavras fixas das rotas depois do primeiro segmento (servers/:id/channels, dm/c). */
const FIXED_SEGMENTS = new Set(['channels', 'c'])

/** Nome de tela: palavra curta em minúsculas ("servers", "forgot-password"). */
const SCREEN_NAME = /^[a-z][a-z-]{0,31}$/

export function routePattern(path: string): string {
  const segments = path.split(/[?#]/)[0].split('/').filter(Boolean)
  if (segments.length === 0) return '/'
  const [first, ...rest] = segments
  const head = SCREEN_NAME.test(first) ? first : ':id'
  const tail = rest.map((segment) => (FIXED_SEGMENTS.has(segment) ? segment : ':id'))
  return '/' + [head, ...tail].join('/')
}

/** A rota atual: o hash no desktop (hash router, file://), o caminho na web. */
export function currentRoute(location: { pathname: string; hash: string }, hashRouter: boolean): string {
  return routePattern(hashRouter ? location.hash.replace(/^#/, '') : location.pathname)
}
