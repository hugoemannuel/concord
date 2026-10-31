import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import EventGame from './EventGame'

describe('EventGame', () => {
  it('mostra o logo e o nome do jogo', () => {
    const html = renderToStaticMarkup(<EventGame name="Minecraft" />)
    expect(html).toContain('Minecraft')
    expect(html).toContain('<svg')
  })

  it('sem jogo não renderiza nada', () => {
    expect(renderToStaticMarkup(<EventGame name={null} />)).toBe('')
  })

  it('nome muito longo trunca em vez de estourar a linha', () => {
    const html = renderToStaticMarkup(<EventGame name={'j'.repeat(64)} />)
    expect(html).toContain('truncate')
    expect(html).toContain('min-w-0')
  })
})
