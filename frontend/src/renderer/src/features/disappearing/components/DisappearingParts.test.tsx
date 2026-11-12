import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import DisappearingBanner from './DisappearingBanner'
import DisappearingMenu from './DisappearingMenu'
import ExpiryMark from './ExpiryMark'

describe('faixa e relógio', () => {
  it('faixa só aparece com o modo ligado, com o texto aprovado', () => {
    expect(renderToStaticMarkup(<DisappearingBanner seconds={null} />)).toBe('')
    expect(renderToStaticMarkup(<DisappearingBanner seconds={604800} />)).toContain(
      'Mensagens temporárias ativadas: 7 dias'
    )
  })

  it('relógio só com expires_at e com a dica "Some em ..."', () => {
    expect(renderToStaticMarkup(<ExpiryMark expiresAt={null} />)).toBe('')
    const out = renderToStaticMarkup(
      <ExpiryMark expiresAt={new Date(Date.now() + 3 * 86_400_000 - 1000).toISOString()} />
    )
    expect(out).toContain('title="Some em 3 dias"')
  })

  it('menu: 4 opções radio, só a atual marcada', () => {
    const out = renderToStaticMarkup(
      <DisappearingMenu current={604800} sheet={false} onChoose={() => {}} />
    )
    expect(out.match(/role="radio"/g)).toHaveLength(4)
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(/aria-checked="true"[^>]*>7 dias/.test(out)).toBe(true)
    for (const l of ['Desativadas', '24 horas', '90 dias']) expect(out).toContain(l)
  })
})
