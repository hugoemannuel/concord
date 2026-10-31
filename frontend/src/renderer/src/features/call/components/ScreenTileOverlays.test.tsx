import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const drawing = vi.hoisted(() => ({ active: false }))
vi.mock('../store/annotationStore', () => ({
  useAnnotationStore: (select: (s: object) => unknown) =>
    select({ drawingActive: { u1: drawing.active }, toggleDrawing: () => {} })
}))
vi.mock('./ScreenWatchersOverlay', () => ({
  default: ({ className }: { className?: string }) => (
    <div data-testid="watchers" className={className} />
  )
}))

import ScreenTileOverlays from './ScreenTileOverlays'

const user = { id: 'u1', username: 'ana', display_name: 'Ana' }

const render = (props: Partial<Parameters<typeof ScreenTileOverlays>[0]> = {}): string =>
  renderToStaticMarkup(
    <ScreenTileOverlays user={user} watchers={[user]} hasHeaderOffset={false} {...props} />
  )

/** A tag de abertura do elemento que contém o marcador. */
const classOf = (html: string, marker: string): string => {
  const at = html.indexOf(marker)
  const start = html.lastIndexOf('<', at)
  return html.slice(start, html.indexOf('>', at))
}

describe('ScreenTileOverlays', () => {
  beforeEach(() => {
    drawing.active = false
  })

  it('Desenhar e Ao vivo só aparecem com o mouse no tile', () => {
    const html = render({ onClose: () => {} })
    const group = classOf(html, '<button type="button"')
    expect(html).toContain('Ao vivo')
    // O contêiner de Desenhar + Ao vivo é o pai do primeiro botão.
    const before = html.slice(0, html.indexOf('<button type="button"'))
    expect(before.slice(before.lastIndexOf('<div'))).toContain('group-hover/tile:opacity-100')
    expect(group).toContain('Anotações')
  })

  it('desenhando, Desenhar fica sempre visível', () => {
    drawing.active = true
    const html = render({ onClose: () => {} })
    const before = html.slice(0, html.indexOf('<button type="button"'))
    expect(before.slice(before.lastIndexOf('<div'))).not.toContain('opacity-0')
  })

  it('o X de fechar fica sempre visível', () => {
    const html = render({ onClose: () => {} })
    const close = html.indexOf('Fechar transmissão')
    const tag = html.slice(html.lastIndexOf('<button', close), close)
    expect(tag).not.toContain('opacity-0')
    const outer = html.slice(html.indexOf('<div class="absolute right-2'))
    expect(outer.slice(0, outer.indexOf('>'))).not.toContain('opacity-0')
  })

  it('quem está assistindo também só aparece no hover', () => {
    expect(classOf(render(), 'data-testid="watchers"')).toContain('group-hover/tile:opacity-100')
  })
})
