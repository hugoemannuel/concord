import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import RailDmItem from './RailDmItem'

const item = (unread: number): string =>
  renderToStaticMarkup(
    <RailDmItem name="Ana" unread={unread} onOpen={vi.fn()}>
      <span data-testid="avatar" />
    </RailDmItem>
  )

describe('DM não lida no trilho', () => {
  it('mostra o avatar e a quantidade de mensagens', () => {
    const html = item(3)
    expect(html).toContain('data-testid="avatar"')
    expect(html).toContain('>3</span>')
  })

  it('o botão diz quem mandou e quantas mensagens (leitor de tela e dica do mouse)', () => {
    const html = item(1)
    expect(html).toContain('aria-label="Ana, 1 mensagem não lida"')
    expect(html).toContain('title="Ana, 1 mensagem não lida"')
  })

  it('muitas mensagens viram 99+', () => {
    expect(item(150)).toContain('>99+</span>')
  })
})
