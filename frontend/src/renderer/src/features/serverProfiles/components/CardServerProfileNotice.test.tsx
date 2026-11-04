import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import CardServerProfileNotice from './CardServerProfileNotice'

const card = (over: { available: boolean; showingGlobal: boolean }) => ({
  ...over,
  scopeId: 's1',
  openServerId: 's1',
  nextGlobalFor: null,
  toggle: vi.fn()
})

describe('CardServerProfileNotice', () => {
  it('sem perfil no servidor o cartão não muda', () => {
    expect(
      renderToStaticMarkup(<CardServerProfileNotice card={card({ available: false, showingGlobal: false })} />)
    ).toBe('')
  })

  it('no perfil do servidor oferece o global', () => {
    const html = renderToStaticMarkup(
      <CardServerProfileNotice card={card({ available: true, showingGlobal: false })} />
    )
    expect(html).toContain('Perfil neste servidor')
    expect(html).toContain('Ver perfil global')
  })

  it('no global oferece voltar', () => {
    const html = renderToStaticMarkup(
      <CardServerProfileNotice card={card({ available: true, showingGlobal: true })} />
    )
    expect(html).toContain('Perfil global')
    expect(html).toContain('Ver perfil do servidor')
  })
})
