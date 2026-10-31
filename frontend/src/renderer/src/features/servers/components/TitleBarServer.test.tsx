import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import TitleBarServer from './TitleBarServer'

const render = (server: Parameters<typeof TitleBarServer>[0]['server']): string =>
  renderToStaticMarkup(<TitleBarServer server={server} />)

describe('TitleBarServer', () => {
  it('sem servidor aberto não mostra nada', () => {
    expect(render(null)).toBe('')
  })

  it('mostra o nome do servidor, cortado com reticências se não couber', () => {
    const html = render({ id: 's1', name: 'Brothers', owner_id: 'u' })
    expect(html).toContain('Brothers')
    expect(html).toContain('title="Brothers"')
    expect(html).toContain('truncate')
  })

  it('com ícone mostra a foto/GIF antes do nome', () => {
    const html = render({ id: 's1', name: 'Brothers', owner_id: 'u', icon_url: 'https://x/y.gif' })
    expect(html).toMatch(/<img[^>]*src="https:\/\/x\/y.gif".*Brothers/)
  })

  it('sem ícone usa a inicial', () => {
    expect(render({ id: 's1', name: 'brothers', owner_id: 'u' })).toContain('>B<')
  })
})
