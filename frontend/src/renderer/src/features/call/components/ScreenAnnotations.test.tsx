import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const drawing = vi.hoisted(() => ({ active: false }))
vi.mock('../store/callStore', () => ({
  useCallStore: (select: (s: object) => unknown) => select({ callId: 'c1' })
}))
vi.mock('../store/annotationStore', () => ({
  useAnnotationStore: (select: (s: object) => unknown) =>
    select({ drawingActive: { u1: drawing.active }, toggleDrawing: () => {} })
}))
vi.mock('./ScreenAnnotationCanvas', () => ({
  default: (p: { callId: string; isDrawingMode: boolean }) => (
    <div data-canvas={p.callId} data-drawing={String(p.isDrawingMode)} />
  )
}))
vi.mock('./ScreenAnnotationToolbar', () => ({ default: () => <div data-toolbar="" /> }))

import ScreenAnnotations from './ScreenAnnotations'

const user = { id: 'u1', username: 'ana', display_name: 'Ana' }

describe('ScreenAnnotations', () => {
  beforeEach(() => {
    drawing.active = false
  })

  it('sempre tem a camada de desenho, sem a barra de ferramentas', () => {
    const html = renderToStaticMarkup(<ScreenAnnotations user={user} />)
    expect(html).toContain('data-canvas="c1"')
    expect(html).toContain('data-drawing="false"')
    expect(html).not.toContain('data-toolbar')
  })

  it('desenhando mostra a barra de ferramentas', () => {
    drawing.active = true
    const html = renderToStaticMarkup(<ScreenAnnotations user={user} />)
    expect(html).toContain('data-drawing="true"')
    expect(html).toContain('data-toolbar')
  })
})
