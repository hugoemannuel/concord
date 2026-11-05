import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChannelType } from '../api/channels'
import type { LayoutTree } from '../lib/channelLayoutTree'
import { createPeekTimer, startDragGesture, type GestureEnv } from '../lib/sidebarDragGesture'
import {
  autoScrollStep,
  dragPointInList,
  ghostPosition,
  hoverFromElement,
  peekCandidate,
  pressCanDrag,
  resolveDrop,
  sameHover,
  type DropHover,
  type DropTarget,
  type SidebarDrag
} from '../lib/sidebarDrop'
import { useChannelSidebarStore } from '../store/channelSidebarStore'

type DragSourceProps = {
  onPointerDown?: (event: React.PointerEvent<HTMLElement>) => void
  'data-dnd'?: string
  'data-id'?: string
  'data-category'?: string
  'data-collapsed'?: string
}

export interface SidebarDragApi {
  drag: SidebarDrag | null
  /** Onde o item cairia se soltasse agora (null: fora de alvo ou sem mudança). */
  target: DropTarget | null
  /** A categoria recolhida está aberta porque um canal parou em cima dela. */
  isPeeked: (categoryId: string) => boolean
  channelRow: (channelId: string, type: ChannelType, categoryId: string | null) => DragSourceProps
  categoryHeader: (categoryId: string, collapsed: boolean) => DragSourceProps
  categoryBlock: (categoryId: string) => DragSourceProps
  /** A lista sem categoria, inclusive vazia: soltar nela tira o canal da categoria. */
  loose: () => DragSourceProps
  /** Liga o fantasma: ele segue o ponteiro sem re-renderizar a lista. */
  attachGhost: (element: HTMLElement | null) => void
}

interface DragOptions {
  serverId: string
  canManage: boolean
  tree: LayoutTree
  onDrop: (drag: SidebarDrag, target: DropTarget) => void
}

function placeGhost(element: HTMLElement | null, point: { x: number; y: number }): void {
  if (!element) return
  const { x, y } = ghostPosition(point, element.offsetWidth, window.innerWidth)
  element.style.transform = `translate(${x}px, ${y}px)`
}

function hoverAtPoint(scroller: HTMLElement | null, kind: SidebarDrag['kind'], x: number, y: number): DropHover | null {
  const point = scroller ? dragPointInList(x, y, scroller.getBoundingClientRect()) : null
  if (!point) return null
  return hoverFromElement(document.elementFromPoint(point.x, point.y), point.y, kind)
}

function scrollList(scroller: HTMLElement | null, y: number): boolean {
  if (!scroller) return false
  const rect = scroller.getBoundingClientRect()
  const before = scroller.scrollTop
  scroller.scrollTop += autoScrollStep(y, rect.top, rect.bottom)
  return scroller.scrollTop !== before
}

function setPageDragging(on: boolean): void {
  document.body.style.userSelect = on ? 'none' : ''
  document.body.style.cursor = on ? 'grabbing' : ''
}

/** Arrastar canais e categorias na barra (mouse e toque; quem não gerencia não arrasta). */
export function useSidebarDrag(options: DragOptions): SidebarDragApi {
  const { serverId, canManage, tree } = options
  const [drag, setDrag] = useState<SidebarDrag | null>(null)
  const [hover, setHover] = useState<DropHover | null>(null)
  const [peeked, setPeeked] = useState<string[]>([])
  const closeMenu = useChannelSidebarStore((state) => state.closeMenu)
  // O gesto dura vários renders: ao soltar, vale a lista de agora, não a do começo.
  const latest = useRef(options)
  useEffect(() => {
    latest.current = options
  })
  const hoverNow = useRef<DropHover | null>(null)
  const ghost = useRef<HTMLElement | null>(null)
  const pointer = useRef({ x: 0, y: 0 })
  const cancelGesture = useRef<(() => void) | null>(null)
  const peek = useMemo(() => createPeekTimer((id) => setPeeked((ids) => [...ids, id])), [])
  useEffect(() => () => cancelGesture.current?.(), [serverId])

  const updateHover = (source: SidebarDrag, scroller: HTMLElement | null, x: number, y: number): void => {
    const next = hoverAtPoint(scroller, source.kind, x, y)
    peek.hover(peekCandidate(source, next))
    if (sameHover(hoverNow.current, next)) return
    hoverNow.current = next
    setHover(next)
  }
  const finish = (source: SidebarDrag, drop: boolean): void => {
    const { tree: finalTree, onDrop } = latest.current
    const landed = resolveDrop(finalTree, source, hoverNow.current)
    peek.hover(null)
    hoverNow.current = null
    cancelGesture.current = null
    setHover(null)
    setDrag(null)
    setPeeked([])
    setPageDragging(false)
    if (drop && landed) onDrop(source, landed)
  }
  const gestureEnv = (source: SidebarDrag, scroller: HTMLElement | null): GestureEnv => ({
    events: window,
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
    activate: () => {
      closeMenu()
      setDrag(source)
      setPageDragging(true)
      navigator.vibrate?.(10)
    },
    move: (x, y) => {
      pointer.current = { x, y }
      placeGhost(ghost.current, pointer.current)
      updateHover(source, scroller, x, y)
    },
    autoScroll: (y) => scrollList(scroller, y),
    finish: (dropped) => finish(source, dropped)
  })
  const press = (source: SidebarDrag) => (event: React.PointerEvent<HTMLElement>): void => {
    if (!pressCanDrag(event.button, event.target as Element)) return
    cancelGesture.current?.()
    const scroller = event.currentTarget.closest<HTMLElement>('[data-dnd="list"]')
    cancelGesture.current = startDragGesture(gestureEnv(source, scroller), {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      x: event.clientX,
      y: event.clientY
    })
  }
  const attachGhost = useCallback((element: HTMLElement | null) => {
    ghost.current = element
    placeGhost(element, pointer.current)
  }, [])
  const managed = (props: DragSourceProps): DragSourceProps => (canManage ? props : {})
  return {
    drag,
    target: drag ? resolveDrop(tree, drag, hover) : null,
    isPeeked: (id) => peeked.includes(id),
    channelRow: (id, type, categoryId) => managed({
      onPointerDown: press({ kind: 'channel', id, type, categoryId }),
      'data-dnd': 'channel',
      'data-id': id,
      'data-category': categoryId ?? undefined
    }),
    categoryHeader: (id, collapsed) => managed({
      onPointerDown: press({ kind: 'category', id }),
      'data-dnd': 'category-header',
      'data-id': id,
      'data-collapsed': String(collapsed)
    }),
    categoryBlock: (id) => managed({ 'data-dnd': 'category-block', 'data-id': id }),
    loose: () => managed({ 'data-dnd': 'loose' }),
    attachGhost
  }
}
