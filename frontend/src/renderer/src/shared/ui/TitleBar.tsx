import { useLayoutEffect, type ReactNode } from 'react'
import { SalinhaMarkIcon } from './icons'

const HEIGHT = '32px'

/**
 * Faixa no topo da janela, na cor de fundo do tema (--bg-app, a mesma dos
 * botões nativos; ver store/themeStore.ts) e deixa o canto direito livre
 * para os botões nativos de minimizar, maximizar e fechar, que o Electron
 * desenha por cima. `center`: o que fica no meio da faixa (o servidor aberto).
 *
 * A faixa é a barra de título do sistema (`app-drag`, -webkit-app-region):
 * quem arrasta é o Windows, então Snap nas bordas, arrastar até o topo para
 * maximizar, desmaximizar arrastando e duplo clique funcionam como em qualquer
 * app. Não troque por arraste manual (setPosition): o Windows não vê o gesto.
 */
function TitleBar({ center }: { center?: ReactNode }): React.JSX.Element {
  // Toasts e avisos fixos no topo descem essa altura (var --titlebar-height).
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--titlebar-height', HEIGHT)
    return () => {
      document.documentElement.style.removeProperty('--titlebar-height')
    }
  }, [])

  return (
    <div
      style={{ height: HEIGHT }}
      className="app-drag relative flex shrink-0 select-none items-center gap-2 bg-app pl-3 pr-[140px]"
    >
      <SalinhaMarkIcon className="h-4 w-4 text-muted" />
      <span className="text-ds-xs font-semibold tracking-wide text-muted">Salinha</span>
      {/* Margens iguais dos dois lados (a dos botões nativos) para ficar no centro da janela. */}
      <div className="absolute inset-y-0 left-[140px] right-[140px] flex items-center justify-center">
        {center}
      </div>
    </div>
  )
}

export default TitleBar
