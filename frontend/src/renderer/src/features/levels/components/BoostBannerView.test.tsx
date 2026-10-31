import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { boostRank } from '../lib/boost'
import BoostBannerView from './BoostBannerView'

const render = (percent: number, eligible = 4): string =>
  renderToStaticMarkup(<BoostBannerView eligible={eligible} rank={boostRank(percent)!} />)
const count = (html: string, needle: string): number => html.split(needle).length - 1

describe('BoostBannerView', () => {
  it('D: letra, texto, multiplicador e pessoas, sem efeitos', () => {
    const html = render(125, 2)
    expect(html).toContain('aria-label="Buff de XP x1.25: Dope!"')
    expect(html).toContain('Dope!')
    expect(html).toContain('x1.25')
    expect(html).toContain('2 pessoas')
    for (const fx of ['boost-flash', 'boost-edge', 'boost-ring']) expect(html).not.toContain(fx)
    expect(count(html, 'boost-spark')).toBe(0)
  })

  it('sem contagem de pessoas, não escreve "pessoas"', () => {
    expect(render(150, 0)).not.toContain('pessoas')
  })

  it('S pisca as bordas mas não tem anel nem faíscas', () => {
    const html = render(250, 6)
    expect(html).toContain('boost-edge')
    expect(html).not.toContain('boost-ring')
    expect(count(html, 'boost-spark')).toBe(0)
  })

  it('SS tem anel, bordas e 12 faíscas, sem flash de tela', () => {
    const html = render(300, 8)
    expect(html).toContain('boost-ring')
    expect(html).toContain('boost-edge')
    expect(count(html, 'boost-spark')).toBe(12)
    expect(html).not.toContain('boost-flash')
  })

  it('SSS tem tudo: flash de tela, anel, bordas e 22 faíscas', () => {
    const html = render(400, 10)
    expect(html).toContain('boost-flash')
    expect(html).toContain('boost-ring')
    expect(html).toContain('boost-edge')
    expect(count(html, 'boost-spark')).toBe(22)
    expect(html).toContain('Smokin&#x27; Sexy Style!')
  })

  it('o estágio vai para a letra (o CSS escolhe pulso e glitch por ele)', () => {
    expect(render(125)).toContain('data-stage="1"')
    expect(render(400)).toContain('data-stage="7"')
  })
})
