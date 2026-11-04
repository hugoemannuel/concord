import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDownIcon } from '../../../shared/ui/icons'
import { isCollapsed, setCollapsed } from '../lib/collapsedSections'
import { nextCell } from '../lib/gridNav'
import { observeOnce } from '../lib/observeOnce'

// A casca do seletor de emojis e figurinhas: trilho (um ícone por servidor),
// seções que rolam e o rodapé com a prévia do item em foco. O estado de foco e
// de rolagem fica aqui: mudar de item não redesenha a grade (milhares de botões).

export interface PickerRailEntry {
  /** Seção para onde o ícone leva. */
  sectionId: string
  label: string
  icon: ReactNode
  /** Outras seções que acendem este ícone (ex.: as categorias do pack base). */
  matches?: (sectionId: string) => boolean
}

export interface PickerPreview {
  media: ReactNode
  title: string
  detail?: string
  aside?: ReactNode
  /** Por que este item está desabilitado. */
  reason?: string
}

const CELL_SELECTOR = '[data-preview-key]'
const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'])

/** Marca a célula para a prévia e as setas do teclado. */
export const previewKeyProps = (key: string): { 'data-preview-key': string } => ({ 'data-preview-key': key })

function PickerRail({
  entries,
  active,
  onJump
}: {
  entries: PickerRailEntry[]
  active: string | null
  onJump: (sectionId: string) => void
}): React.JSX.Element {
  const isActive = (e: PickerRailEntry): boolean =>
    active !== null && (e.sectionId === active || Boolean(e.matches?.(active)))
  return (
    <nav
      aria-label="Ir para a seção"
      className="flex shrink-0 gap-1 overscroll-contain max-md:overflow-x-auto max-md:pb-1 md:w-11 md:flex-col md:overflow-y-auto"
    >
      {entries.map((entry) => (
        <button
          key={entry.sectionId}
          type="button"
          title={entry.label}
          aria-label={entry.label}
          aria-current={isActive(entry) ? 'true' : undefined}
          onClick={() => onJump(entry.sectionId)}
          className={`focus-ring-inset flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-fg/10 ${
            isActive(entry) ? 'bg-fg/10 text-strong' : 'text-muted'
          }`}
        >
          {entry.icon}
        </button>
      ))}
    </nav>
  )
}

function PickerFooter({ preview, idleHint }: { preview: PickerPreview | null; idleHint: string }): React.JSX.Element {
  return (
    // No celular a tela é curta: o rodapé só aparece com um item em foco.
    <div className={`mt-1 flex min-h-12 shrink-0 items-center gap-2 border-t border-subtle px-1 pt-1.5 ${preview ? '' : 'max-md:hidden'}`}>
      {preview ? (
        <>
          <span className="flex size-9 shrink-0 items-center justify-center text-ds-xl">{preview.media}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-ds-sm font-semibold text-strong">{preview.title}</p>
            {preview.detail && <p className="truncate text-ds-xs text-muted">{preview.detail}</p>}
            {preview.reason && <p className="truncate text-ds-xs text-warning">{preview.reason}</p>}
          </div>
          {preview.aside}
        </>
      ) : (
        <p className="min-w-0 truncate text-ds-xs text-faint">{idleHint}</p>
      )}
    </div>
  )
}

/** Acompanha qual seção está no topo da área que rola. */
function useActiveSection(scroller: React.RefObject<HTMLDivElement | null>): {
  active: string | null
  onScroll: () => void
  jump: (sectionId: string) => void
} {
  const [active, setActive] = useState<string | null>(null)
  const frame = useRef<number | null>(null)

  const measure = useCallback(() => {
    frame.current = null
    const box = scroller.current
    if (!box) return
    let current: string | null = null
    for (const el of box.querySelectorAll<HTMLElement>('[data-section-id]')) {
      if (el.offsetTop > box.scrollTop + 8) break
      current = el.dataset.sectionId ?? null
    }
    setActive(current)
  }, [scroller])

  useEffect(() => {
    measure()
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
    }
  }, [measure])

  const onScroll = useCallback(() => {
    frame.current ??= requestAnimationFrame(measure)
  }, [measure])

  const jump = useCallback(
    (sectionId: string) => {
      const box = scroller.current
      const target = box?.querySelector<HTMLElement>(`[data-section-id="${CSS.escape(sectionId)}"]`)
      if (box && target) box.scrollTop = target.offsetTop
    },
    [scroller]
  )

  return { active, onScroll, jump }
}

/** Setas andam entre as células, na ordem da tela. */
function moveFocus(box: HTMLElement, event: React.KeyboardEvent): void {
  if (!ARROWS.has(event.key)) return
  const cells = [...box.querySelectorAll<HTMLElement>(CELL_SELECTOR)]
  const index = cells.indexOf((event.target as HTMLElement).closest<HTMLElement>(CELL_SELECTOR) as HTMLElement)
  if (index < 0) return
  event.preventDefault()
  const boxes = cells.map((c) => ({ left: c.offsetLeft, top: c.offsetTop }))
  cells[nextCell(boxes, index, event.key)]?.focus()
}

export default function ExpressionPicker({
  rail,
  notice,
  header,
  describe,
  idleHint,
  children
}: {
  rail: PickerRailEntry[]
  /** Aviso acima das seções (ex.: sem a permissão de usar itens de fora). */
  notice?: string
  header?: ReactNode
  /** A prévia de uma célula, pela chave de `previewKeyProps`. */
  describe: (key: string) => PickerPreview | null
  idleHint: string
  children: ReactNode
}): React.JSX.Element {
  const scroller = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState<string | null>(null)
  const { active, onScroll, jump } = useActiveSection(scroller)

  const track = (target: EventTarget): void => {
    const key = (target as HTMLElement).closest?.<HTMLElement>(CELL_SELECTOR)?.dataset.previewKey
    if (key) setFocused(key)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      {notice && <p className="mb-1 shrink-0 text-ds-xs text-warning">{notice}</p>}
      <div className="flex min-h-0 flex-1 gap-1 max-md:flex-col">
        <PickerRail entries={rail} active={active} onJump={jump} />
        <div
          ref={scroller}
          onScroll={onScroll}
          onMouseOver={(e) => track(e.target)}
          onFocus={(e) => track(e.target)}
          onKeyDown={(e) => scroller.current && moveFocus(scroller.current, e)}
          className="relative min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pr-1"
        >
          {children}
        </div>
      </div>
      <PickerFooter preview={focused ? describe(focused) : null} idleHint={idleHint} />
    </div>
  )
}

/** Monta o conteúdo só quando chega perto da área visível (o pack tem ~1.900 emojis). */
function LazyBody({
  eager,
  estimatedHeight,
  children
}: {
  eager: boolean
  estimatedHeight: number
  children: ReactNode
}): React.JSX.Element {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(eager)
  useEffect(() => (visible || eager ? undefined : observeOnce(ref.current, () => setVisible(true))), [visible, eager])
  const show = visible || eager
  return (
    <div ref={ref} style={show ? undefined : { height: estimatedHeight }}>
      {show && children}
    </div>
  )
}

/** Uma seção: título recolhível (fica preso ao topo ao rolar) e o conteúdo sob demanda. */
export function PickerSection({
  id,
  title,
  icon,
  eager,
  estimatedHeight,
  children
}: {
  id: string
  title: string
  icon?: ReactNode
  eager: boolean
  estimatedHeight: number
  children: ReactNode
}): React.JSX.Element {
  const [collapsed, setState] = useState(() => isCollapsed(id))
  const toggle = (): void => {
    setCollapsed(id, !collapsed)
    setState(!collapsed)
  }
  return (
    <section data-section-id={id} className="mb-2">
      <h3 className="sticky top-0 z-10 bg-floating">
        <button
          type="button"
          aria-expanded={!collapsed}
          onClick={toggle}
          className="focus-ring-inset flex min-h-7 w-full cursor-pointer items-center gap-1.5 rounded text-left text-ds-xs font-semibold text-muted hover:text-normal max-md:min-h-10"
        >
          {icon}
          <span className="min-w-0 truncate">{title}</span>
          <ChevronDownIcon size={12} className={`shrink-0 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
        </button>
      </h3>
      {!collapsed && (
        <LazyBody eager={eager} estimatedHeight={estimatedHeight}>
          {children}
        </LazyBody>
      )}
    </section>
  )
}
