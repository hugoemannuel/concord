import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { MessageClock, MessageTime } from './MessageTime'

const local = (daysAgo: number, h: number, m: number): string => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - daysAgo, h, m).toISOString()
}

describe('MessageTime', () => {
  it('hoje: só a hora', () => {
    const html = renderToStaticMarkup(<MessageTime iso={local(0, 0, 20)} />)
    expect(html).toContain('>00:20</time>')
  })

  it('ontem: "Ontem às" e a hora', () => {
    const html = renderToStaticMarkup(<MessageTime iso={local(1, 19, 54)} />)
    expect(html).toContain('>Ontem às 19:54</time>')
  })

  it('mais antiga: data numérica e hora', () => {
    const iso = new Date(2020, 10, 2, 19, 54).toISOString()
    const html = renderToStaticMarkup(<MessageTime iso={iso} />)
    expect(html).toContain('>02/11/2020 19:54</time>')
  })

  it('o tooltip traz a data completa e o dateTime o instante exato', () => {
    const iso = new Date(2020, 10, 2, 19, 54).toISOString()
    const html = renderToStaticMarkup(<MessageTime iso={iso} />)
    expect(html).toContain('title="segunda-feira, 2 de novembro de 2020')
    expect(html).toContain(`dateTime="${iso}"`)
  })
})

describe('MessageClock', () => {
  it('só a hora, também com o tooltip da data completa', () => {
    const iso = new Date(2020, 10, 2, 7, 5).toISOString()
    const html = renderToStaticMarkup(<MessageClock iso={iso} className="x" />)
    expect(html).toContain('>07:05</time>')
    expect(html).toContain('title="segunda-feira, 2 de novembro de 2020')
    expect(html).toContain('class="x"')
  })
})
