import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MessageDayDivider, { DayDivider } from './MessageDayDivider'

const at = (d: number, h: number, m = 0): { created_at: string } => ({
  created_at: new Date(2026, 9, d, h, m).toISOString()
})

describe('DayDivider', () => {
  it('é um separador acessível com a data no meio', () => {
    const html = renderToStaticMarkup(<DayDivider text="3 de novembro de 2026" />)
    expect(html).toContain('role="separator"')
    expect(html).toContain('aria-label="3 de novembro de 2026"')
    expect(html).toContain('3 de novembro de 2026</span>')
  })
})

describe('MessageDayDivider', () => {
  it('a primeira mensagem da lista abre o dia', () => {
    const html = renderToStaticMarkup(
      <MessageDayDivider message={at(25, 12)} previous={undefined} />
    )
    expect(html).toContain('25 de outubro de 2026')
  })

  it('mesmo dia: nenhum separador', () => {
    expect(
      renderToStaticMarkup(<MessageDayDivider message={at(25, 13)} previous={at(25, 12)} />)
    ).toBe('')
  })

  it('dia seguinte: separador, mesmo a poucos minutos da anterior', () => {
    const html = renderToStaticMarkup(
      <MessageDayDivider message={at(26, 0, 2)} previous={at(25, 23, 58)} />
    )
    expect(html).toContain('26 de outubro de 2026')
  })

  it('mensagem com data inválida não desenha separador', () => {
    expect(
      renderToStaticMarkup(
        <MessageDayDivider message={{ created_at: 'lixo' }} previous={undefined} />
      )
    ).toBe('')
  })
})
