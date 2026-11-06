import { Fragment, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  menuKeyAction,
  menuPosition,
  type MessageMenuAction,
  type MessageMenuItem
} from '../lib/messageMenu'
import { useIsMobile } from '../../navigation/hooks/useIsMobile'
import { useDismiss } from '../../../shared/hooks/useDismiss'
import { insideAny } from '../../../shared/lib/dismiss'

const MENU_WIDTH = 220
const ITEM_SELECTOR = '[role="menuitem"]'
const POPOVER_CLASS =
  'fixed z-50 max-h-[calc(100dvh-16px)] max-w-[calc(100vw-16px)] overflow-y-auto rounded-lg border border-subtle bg-floating p-1.5 shadow-2xl'
const SHEET_CLASS =
  'animate-sheet-in fixed inset-x-0 bottom-0 z-50 max-h-[70dvh] overflow-y-auto overscroll-contain rounded-t-xl border-t border-subtle bg-floating px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl'

const menuItems = (menu: HTMLElement | null): HTMLElement[] => [
  ...(menu?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])
]

/**
 * Menu "Mais" da barra de ações da mensagem, num portal com posição fixa
 * (o scroll do chat não corta) e sem sair da janela. Teclado: abre com o
 * foco no primeiro item; setas, Home e End andam; Esc ou Tab fecham e
 * devolvem o foco ao "…". Clique fora também fecha.
 */
function MessageMoreMenu({
  anchor,
  groups,
  onAction,
  onClose
}: {
  /** O botão "…" que abriu o menu. */
  anchor: HTMLElement
  groups: MessageMenuItem[][]
  onAction: (action: MessageMenuAction) => void
  onClose: () => void
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState(0)
  // Celular: folha que sobe de baixo, com alvos grandes (o dedo não acerta 32 px).
  const sheet = useIsMobile()

  // Mede antes de pintar (a posição final já sai no primeiro quadro) e foca o
  // primeiro item para o teclado.
  useLayoutEffect(() => {
    setHeight(ref.current?.offsetHeight ?? 0)
    menuItems(ref.current)[0]?.focus()
  }, [])

  // O Esc fica com a navegação do menu (onKeyDown), que devolve o foco ao "…".
  useDismiss((target) => insideAny([ref.current, anchor], target), () => onClose(), { event: 'pointerdown', escape: false })

  const closeToAnchor = (): void => {
    onClose()
    anchor.focus()
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = menuItems(ref.current)
    const action = menuKeyAction(
      e.key,
      items.indexOf(document.activeElement as HTMLElement),
      items.length
    )
    if (action === null) return
    e.preventDefault()
    if (action === 'close') {
      e.stopPropagation()
      closeToAnchor()
      return
    }
    items[action].focus()
  }

  const position = menuPosition(
    anchor.getBoundingClientRect(),
    { width: MENU_WIDTH, height },
    { width: window.innerWidth, height: window.innerHeight }
  )

  return createPortal(
    <>
      {sheet && <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/50" />}
      <div
        ref={ref}
        role="menu"
        aria-label="Mais ações"
        onKeyDown={onKeyDown}
        style={sheet ? undefined : { ...position, width: MENU_WIDTH }}
        className={sheet ? SHEET_CLASS : POPOVER_CLASS}
      >
        {groups.map((group, i) => (
          <Fragment key={group[0].action}>
            {i > 0 && <div role="separator" className="mx-1 my-1 h-px bg-fg/10" />}
            {group.map((item) => (
              <MenuItem
                key={item.action}
                item={item}
                onClick={() => {
                  onClose()
                  onAction(item.action)
                }}
              />
            ))}
          </Fragment>
        ))}
      </div>
    </>,
    document.body
  )
}

function MenuItem({
  item,
  onClick
}: {
  item: MessageMenuItem
  onClick: () => void
}): React.JSX.Element {
  const tone = item.danger
    ? 'text-danger hover:bg-danger-strong hover:text-white focus-visible:bg-danger-strong focus-visible:text-white'
    : 'text-secondary hover:bg-brand hover:text-white focus-visible:bg-brand focus-visible:text-white'
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      className={`flex min-h-8 w-full cursor-pointer items-center rounded px-2 py-1.5 text-left text-ds-sm font-medium outline-none transition-colors max-md:min-h-12 max-md:px-3 max-md:text-ds-md ${tone}`}
    >
      {item.label}
    </button>
  )
}

export default MessageMoreMenu
