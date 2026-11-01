import { useReducer } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeftIcon, XIcon } from './icons'
import {
  settingsMobileStart,
  settingsMobileView,
  settingsShellClasses,
  tappedCurrentSection
} from '../lib/settingsMobileView'

interface SettingsShellProps {
  /** Rótulo do diálogo para leitor de tela. */
  ariaLabel: string
  /** O que fica na coluna da esquerda (perfil, busca, lista de seções). */
  nav: React.ReactNode
  /**
   * Seção aberta. No celular, quando muda (escolheram na lista), a tela passa
   * da lista para a seção.
   */
  sectionKey?: string
  title: string
  titleClassName: string
  /** Largura máxima da coluna do conteúdo (ex.: `max-w-[740px]`). */
  contentClassName: string
  closeLabel: string
  onClose: () => void
  /** Irmãos do conteúdo dentro do diálogo (ex.: confirmações). */
  overlay?: React.ReactNode
  children: React.ReactNode
}

/**
 * Casco das telas de configuração em tela cheia (usuário e servidor):
 * navegação à esquerda, seção à direita e o ✕ com ESC. No celular é uma
 * coluna por vez: a lista de seções e, ao escolher, a seção com "voltar".
 */
function SettingsShell({
  ariaLabel,
  nav,
  sectionKey,
  title,
  titleClassName,
  contentClassName,
  closeLabel,
  onClose,
  overlay,
  children
}: SettingsShellProps): React.JSX.Element {
  const [mobile, dispatch] = useReducer(settingsMobileView, sectionKey, settingsMobileStart)
  // Trocou de seção pela lista: no celular, abre a seção.
  if (mobile.key !== sectionKey) dispatch({ type: 'section', key: sectionKey })
  const columns = settingsShellClasses(mobile.view)

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="app-no-drag fixed inset-x-0 bottom-0 z-50 flex flex-col bg-primary pl-safe pr-safe pt-safe text-normal md:flex-row"
      style={{ top: 'var(--titlebar-height, 0px)' }}
    >
      <aside
        // Tocar na seção já marcada também abre ela (no celular).
        onClickCapture={(e) => {
          if (tappedCurrentSection(e.target)) dispatch({ type: 'pickCurrent' })
        }}
        className={`flex w-full shrink-0 flex-col border-b border-subtle bg-secondary pb-safe max-md:pt-12 md:w-[260px] md:border-b-0 md:border-r ${columns.nav}`}
      >
        {nav}
      </aside>

      <main className={`relative min-h-0 min-w-0 flex-1 overflow-y-auto ${columns.main}`}>
        <div className={`mx-auto w-full px-4 pb-28 pt-3 sm:px-10 md:pt-14 ${contentClassName}`}>
          <button
            type="button"
            onClick={() => dispatch({ type: 'back' })}
            className="-ml-2 mb-3 flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-ds-md font-medium text-secondary hover:bg-fg/10 hover:text-strong focus-ring md:hidden"
          >
            <ArrowLeftIcon className="size-5" />
            {ariaLabel}
          </button>
          <h1 className={`mb-6 ${titleClassName}`}>{title}</h1>
          {children}
        </div>
      </main>

      {/* Fixo no canto: aparece na lista e na seção. */}
      <div className="fixed right-3 top-[calc(var(--titlebar-height,0px)+env(safe-area-inset-top)+0.5rem)] flex flex-col items-center gap-1 md:right-8 md:top-[calc(var(--titlebar-height,0px)+56px)]">
        <button
          type="button"
          onClick={onClose}
          aria-label={closeLabel}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--text-faint)] text-muted transition-colors hover:border-[var(--text-strong)] hover:text-strong max-md:size-10"
        >
          <XIcon className="h-4 w-4" />
        </button>
        <span className="hidden text-ds-xs font-bold text-faint md:block">ESC</span>
      </div>

      {overlay}
    </div>,
    document.body
  )
}

export default SettingsShell
