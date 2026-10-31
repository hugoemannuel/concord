import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TitleBar from './TitleBar'

describe('TitleBar', () => {
  it('mantém a marca "Salinha" no canto', () => {
    expect(renderToStaticMarkup(<TitleBar />)).toContain('Salinha')
  })

  it('mostra o conteúdo central (servidor aberto) junto da marca', () => {
    const html = renderToStaticMarkup(<TitleBar center={<span>Brothers</span>} />)
    expect(html).toContain('Salinha')
    expect(html).toMatch(/justify-center[^>]*><span>Brothers<\/span>/)
  })
})
