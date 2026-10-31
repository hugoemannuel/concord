import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

// Na renderização de servidor o zustand devolveria o estado inicial: o store
// fica vazio e vale o que o Avatar recebe.
vi.mock('../../features/profile/store/profileStore', async (orig) => {
  const real = await orig<typeof import('../../features/profile/store/profileStore')>()
  return {
    ...real,
    useUserLook: (_id: string | undefined, fallback: Parameters<typeof real.lookOf>[1]) =>
      real.lookOf(undefined, fallback)
  }
})
vi.mock('../lib/config', () => ({ API_BASE_URL: 'http://host/api' }))
import Avatar from './Avatar'

const gif = '/api/profile-media/a_d'

describe('Avatar com moldura', () => {
  it('sem moldura não desenha nada a mais', () => {
    const html = renderToStaticMarkup(<Avatar name="Mugis" size={32} />)
    expect(html).not.toContain('data-decoration')
  })

  it('a moldura fica por cima, 1,2× maior e centralizada', () => {
    const html = renderToStaticMarkup(
      <Avatar name="Mugis" size={32} decorationUrl="/api/profile-media/d" />
    )
    expect(html).toContain('data-decoration')
    expect(html).toContain('width:38px')
    expect(html).toContain('left:-3px')
    expect(html).toContain('pointer-events-none')
  })

  it('moldura GIF numa lista: só o quadro parado até o hover', () => {
    const html = renderToStaticMarkup(<Avatar name="Mugis" size={32} decorationUrl={gif} />)
    expect(html).toContain('/a_d/static')
    expect(html).not.toContain('/a_d"')
  })

  it('com a linha ativa (hover/foco) monta a moldura animada', () => {
    const html = renderToStaticMarkup(<Avatar name="Mugis" size={32} decorationUrl={gif} active />)
    expect(html).toContain('/a_d"')
  })

  it("animate='always' anima a moldura direto", () => {
    const html = renderToStaticMarkup(
      <Avatar name="Mugis" size={32} decorationUrl={gif} animate="always" />
    )
    expect(html).toContain('/a_d"')
    expect(html).not.toContain('/a_d/static')
  })
})
