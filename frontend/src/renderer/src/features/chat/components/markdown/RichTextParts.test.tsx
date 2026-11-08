import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// O chip de menção puxa o chatStore inteiro (e o áudio da call).
vi.mock('../MentionChip', () => ({
  default: ({ displayText }: { displayText: string }) => <b>{displayText}</b>
}))

import RichTextParts from './RichTextParts'

const render = (parts: Parameters<typeof RichTextParts>[0]['parts']): string =>
  renderToStaticMarkup(<RichTextParts parts={parts} emojiSize="inline" />)

describe('RichTextParts', () => {
  it('texto puro sai como está', () => {
    expect(render([{ text: 'oi <b>' }])).toBe('oi &lt;b&gt;')
  })

  it('link abre fora, isolado da direita para a esquerda e com o host no title', () => {
    const html = render([{ text: 'x.com/a', href: 'https://x.com/a' }])
    expect(html).toContain('href="https://x.com/a"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('dir="ltr"')
    expect(html).toContain('title="x.com"')
  })

  it('host inválido cai no próprio href', () => {
    expect(render([{ text: 'x', href: 'nada' }])).toContain('title="nada"')
  })

  it('menção vira chip', () => {
    expect(render([{ text: '@ana', mention: 'ana' }])).toContain('<b>@ana</b>')
  })
})
