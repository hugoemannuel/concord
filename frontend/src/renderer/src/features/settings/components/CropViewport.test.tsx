import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import CropViewport from './CropViewport'
import { CropFooter, ZoomSlider } from './CropControls'

const base = {
  frame: { width: 300, height: 300 },
  src: 'blob:x',
  zoom: 1,
  offset: { x: 0, y: 0 },
  imgRef: { current: null },
  onNatural: vi.fn(),
  onOffset: vi.fn(),
  onImageError: vi.fn()
}

describe('CropViewport', () => {
  it('avatar é redondo e a imagem ocupa o quadro depois de carregar', () => {
    const html = renderToStaticMarkup(
      <CropViewport {...base} round natural={{ width: 600, height: 600 }} />
    )
    expect(html).toContain('rounded-full')
    expect(html).toContain('width:300px')
    expect(html).toContain('blob:x')
  })

  it('banner é retangular e, antes de carregar, a imagem fica sem posição', () => {
    const html = renderToStaticMarkup(<CropViewport {...base} round={false} natural={null} />)
    expect(html).toContain('rounded-lg')
    expect(html).not.toContain('left:')
    expect(html).not.toContain('data-crop-cutout')
  })

  it('moldura demarca a área circular central do avatar e arredonda os cantos', () => {
    const html = renderToStaticMarkup(
      <CropViewport {...base} round={false} cutout natural={{ width: 600, height: 600 }} />
    )
    expect(html).toContain('data-crop-cutout')
    expect(html).toContain('border-radius:16px')
    expect(html).toContain('width:250px;height:250px')
  })
})

describe('CropControls', () => {
  it('zoom vai de 1 a 3', () => {
    const html = renderToStaticMarkup(<ZoomSlider zoom={1.5} onZoom={vi.fn()} />)
    expect(html).toContain('min="1"')
    expect(html).toContain('max="3"')
  })

  it('Aplicar fica desligado sem a imagem carregada ou ocupado', () => {
    const noop = vi.fn()
    const props = { onReset: noop, onCancel: noop, onApply: noop }
    const idle = renderToStaticMarkup(<CropFooter {...props} busy={false} canApply />)
    const loading = renderToStaticMarkup(<CropFooter {...props} busy={false} canApply={false} />)
    const busy = renderToStaticMarkup(<CropFooter {...props} busy canApply />)
    expect(idle).toContain('Aplicar')
    expect(idle).not.toContain('disabled=""')
    expect(loading).toContain('disabled=""')
    expect(busy).toContain('Aplicando…')
    expect(busy).toContain('disabled=""')
  })
})
