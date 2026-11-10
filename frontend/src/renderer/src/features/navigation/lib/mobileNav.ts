// Navegação do celular (abaixo de 768 px) no padrão do Discord mobile: uma
// coluna por vez. A "lista" (trilho de servidores + canais/DMs) ou o
// "conteúdo" (chat, chamada, amigos). Quem decide qual aparece é a rota: estas
// funções puras traduzem cada navegação no painel da frente. Ver ADR 0007.

import { isHubPath } from '../../improvements/lib/hub'

/** Qual coluna aparece no celular. No desktop as duas aparecem sempre. */
export type MobilePanel = 'nav' | 'content'

/** Abaixo disto é celular: uma coluna por vez (o `md` do Tailwind é 768). */
export const MOBILE_QUERY = '(max-width: 767px)'

export type NavigationAction = 'PUSH' | 'REPLACE' | 'POP'

/**
 * A "seção" da rota: o que a lista da esquerda mostra. Trocar de seção é
 * trocar de servidor (ou ir ao Início) no trilho.
 */
export function sectionOf(path: string): string {
  const server = /^\/servers\/([^/]+)/.exec(path)
  if (server) return `server:${server[1]}`
  const visit = /^\/visitas\/([^/]+)/.exec(path)
  if (visit) return `visit:${visit[1]}`
  if (isHubPath(path)) return 'improvements'
  return 'home'
}

/** O tipo da seção ('server', 'visit', 'improvements' ou 'home'): a coluna da esquerda. */
export function sectionKind(path: string): string {
  return sectionOf(path).split(':')[0]
}

// Rotas que são uma conversa/tela própria (não só "a lista daquele lugar"). A
// visita de visitante só tem a call: abre direto nela. O painel das lives
// (devs) e as favoritas são telas sem lista.
const CONTENT_PATHS = [
  /^\/servers\/[^/]+\/channels\//,
  /^\/dm\//,
  /^\/visitas\//,
  /^\/observabilidade/,
  /^\/favoritas/
]

// A aba do diamante (Melhorias, Propostas, Novidades, Rank global) não tem lista
// própria: abre direto no conteúdo, e cada tela volta ao hub pelo próprio botão.
const isContentPath = (path: string): boolean =>
  isHubPath(path) || CONTENT_PATHS.some((re) => re.test(path))

/** Ao abrir o app (ou recarregar): link direto de um chat abre nele; o resto, na lista. */
export function initialPanel(path: string): MobilePanel {
  return isContentPath(path) ? 'content' : 'nav'
}

/**
 * O painel depois de uma navegação.
 * - Trocou de seção (outro servidor, Início): mostra a lista daquele lugar,
 *   a não ser que já tenha caído numa conversa (busca, notificação, Propostas).
 * - Mesma seção: escolheu um canal/DM na lista, abre o conteúdo. O
 *   REPLACE para outro caminho é o redirecionamento ao último canal do
 *   servidor e não tira a lista da frente.
 */
export function panelAfterNavigation(
  nav: { prev: string; next: string; action: NavigationAction },
  current: MobilePanel
): MobilePanel {
  if (sectionOf(nav.prev) !== sectionOf(nav.next)) return initialPanel(nav.next)
  if (nav.action === 'REPLACE' && nav.prev !== nav.next) return current
  return 'content'
}

/**
 * Classes das duas colunas da casca. Só valem abaixo do `md` (max-md:): no
 * desktop nada muda.
 */
export function shellPanelClasses(panel: MobilePanel): { nav: string; content: string } {
  return panel === 'nav'
    ? { nav: 'flex h-full max-md:w-full', content: 'max-md:hidden' }
    : { nav: 'flex h-full max-md:hidden', content: '' }
}
