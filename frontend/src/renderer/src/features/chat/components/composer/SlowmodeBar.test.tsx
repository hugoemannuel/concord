import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SlowmodeBar from './SlowmodeBar'

describe('SlowmodeBar', () => {
  it('mostra o texto com o relógio, sem anunciar cada segundo', () => {
    const html = renderToStaticMarkup(<SlowmodeBar text="Modo lento: aguarde 0:12" />)
    expect(html).toContain('Modo lento: aguarde 0:12')
    expect(html).toContain('<svg')
    expect(html).not.toContain('aria-live')
    expect(html).toContain('tabular-nums')
    expect(html).toContain('truncate')
  })

  it('sem texto não ocupa espaço', () => {
    expect(renderToStaticMarkup(<SlowmodeBar text={null} />)).toBe('')
  })
})
