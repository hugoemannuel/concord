// A janela principal só mostra o próprio app. Se algo tentar navegá-la para
// outro endereço (link sem target, redirecionamento), a página de fora
// receberia o mesmo preload (window.api): barramos e, se for um clique em
// link, entregamos ao navegador de fora.

type NavigationEvent = { preventDefault: () => void }

interface NavigableContents {
  getURL(): string
  on(event: 'will-navigate' | 'will-redirect', cb: (event: NavigationEvent, url: string) => void): void
}

/** Mesmo documento do app (mesma origem e caminho; âncora e busca podem mudar). */
export function sameDocument(current: string, target: string): boolean {
  try {
    const a = new URL(current)
    const b = new URL(target)
    return a.protocol === b.protocol && a.host === b.host && a.pathname === b.pathname
  } catch {
    return false
  }
}

export function guardNavigation(
  contents: NavigableContents,
  openOutside: (url: string) => void
): void {
  contents.on('will-navigate', (event, url) => {
    if (sameDocument(contents.getURL(), url)) return
    event.preventDefault()
    openOutside(url)
  })
  contents.on('will-redirect', (event, url) => {
    if (!sameDocument(contents.getURL(), url)) event.preventDefault()
  })
}
