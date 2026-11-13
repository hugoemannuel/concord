import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChannelDisappearingMark from './ChannelDisappearingMark'
import DisappearingBanner from './DisappearingBanner'
import DisappearingMenu from './DisappearingMenu'
import ExpiryMark from './ExpiryMark'
import SheetBackdrop from './SheetBackdrop'

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
    expect(out).toContain('role="img" aria-label="Some em 3 dias"')
  })

  it('menu: 4 opções radio, só a atual marcada', () => {
    const out = renderToStaticMarkup(
      <DisappearingMenu current={604800} sheet={false} onChoose={() => {}} />
    )
    expect(out.match(/role="radio"/g)).toHaveLength(4)
    expect(out.match(/aria-checked="true"/g)).toHaveLength(1)
    expect(/aria-checked="true"[^>]*>7 dias/.test(out)).toBe(true)
    // Roving tabindex: só a marcada entra no Tab; o diálogo da folha é modal.
    expect(out.match(/tabindex="0"/g)).toHaveLength(1)
    expect(out.match(/tabindex="-1"/g)).toHaveLength(3)
    expect(out).not.toContain('aria-modal')
    expect(
      renderToStaticMarkup(<DisappearingMenu current={null} sheet onChoose={() => {}} />)
    ).toContain('aria-modal="true"')
    for (const l of ['Desativadas', '24 horas', '90 dias']) expect(out).toContain(l)
  })

  it('folha: tocar no fundo escuro fecha', () => {
    let closed = 0
    const el = SheetBackdrop({ onClose: () => closed++ })
    el.props.onClick()
    expect(closed).toBe(1)
    expect(renderToStaticMarkup(el)).toContain('aria-hidden="true"')
  })
})

describe('marca do canal', () => {
  it('só com prazo, com rótulo curto e aria-label aprovado', () => {
    expect(renderToStaticMarkup(<ChannelDisappearingMark seconds={null} />)).toBe('')
    const out = renderToStaticMarkup(<ChannelDisappearingMark seconds={604800} />)
    expect(out).toContain('aria-label="Mensagens temporárias ativadas: 7 dias"')
    expect(out).toContain('title="Mensagens temporárias ativadas: 7 dias"')
    expect(out).toContain('7 d')
    expect(out).not.toContain('<button')
  })
})
