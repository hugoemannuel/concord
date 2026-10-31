import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../shared/lib/config', () => ({ API_BASE_URL: 'http://host/api' }))
import Nameplate from './Nameplate'

const gif = '/api/profile-media/a_n'
const png = '/api/profile-media/p'
const fade = 'var(--bg-members)'

const imgs = (html: string): string[] => html.match(/<img[^>]*>/g) ?? []

describe('Nameplate', () => {
  it('sem faixa não desenha nada', () => {
    expect(renderToStaticMarkup(<Nameplate url={null} active fade={fade} />)).toBe('')
  })

  it('GIF na lista: só o quadro parado, preguiçoso', () => {
    const list = imgs(renderToStaticMarkup(<Nameplate url={gif} active={false} fade={fade} />))
    expect(list).toHaveLength(1)
    expect(list[0]).toContain('/a_n/static')
    expect(list[0]).toContain('loading="lazy"')
    expect(list[0]).toContain('decoding="async"')
  })

  it('com a linha ativa monta o GIF por cima', () => {
    const list = imgs(renderToStaticMarkup(<Nameplate url={gif} active fade={fade} />))
    expect(list).toHaveLength(2)
    expect(list[1]).toContain('/a_n"')
  })

  it('forceAnimate (prévia "Animando") roda sem hover', () => {
    const list = imgs(
      renderToStaticMarkup(<Nameplate url={gif} active={false} fade={fade} forceAnimate />)
    )
    expect(list).toHaveLength(1)
    expect(list[0]).toContain('/a_n"')
  })

  it('imagem parada nunca ganha uma segunda camada', () => {
    expect(imgs(renderToStaticMarkup(<Nameplate url={png} active fade={fade} />))).toHaveLength(1)
  })

  it('o degradê de leitura usa a cor do fundo, sem filtro', () => {
    const html = renderToStaticMarkup(<Nameplate url={png} active={false} fade={fade} />)
    expect(html).toContain('linear-gradient(90deg, var(--bg-members)')
    expect(html).not.toContain('filter')
    expect(html).toContain('aria-hidden="true"')
  })
})
