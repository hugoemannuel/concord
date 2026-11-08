import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// O chip de menção e o emoji puxam stores pesados: aqui só importa onde aparecem.
vi.mock('./MentionChip', () => ({
  default: ({ displayText }: { displayText: string }) => <b data-chip>{displayText}</b>
}))
vi.mock('../../emojis/components/MessageCustomEmoji', () => ({
  default: ({ name, size }: { name: string; size: string }) => <i data-emoji={size}>{name}</i>
}))

import MessageText from './MessageText'

const render = (content: string): string =>
  renderToStaticMarkup(<MessageText content={content} everyone={null} />)

const EMOJI = '<:festa:3f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b>'

describe('MessageText com Markdown', () => {
  it('bloco de código: <pre> literal e botão de copiar', () => {
    const html = render('```js\nconst x = **1** @ana\n```')
    expect(html).toContain('<pre')
    expect(html).toContain('const x = **1** @ana')
    expect(html).not.toContain('<strong')
    expect(html).not.toContain('data-chip')
    expect(html).toContain('aria-label="Copiar código"')
  })

  it('spoiler fechado é um botão acessível e esconde o conteúdo', () => {
    const html = render('a resposta é ||42||')
    expect(html).toContain('role="button"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('aria-label="Spoiler. Clique para revelar"')
    expect(html).toMatch(/aria-hidden="true" class="invisible">42</)
  })

  it('negrito, itálico, sublinhado, riscado e código no meio da frase', () => {
    const html = render('**a** *b* __c__ ~~d~~ `e`')
    expect(html).toContain('<strong>a</strong>')
    expect(html).toContain('<em>b</em>')
    expect(html).toContain('<u>c</u>')
    expect(html).toContain('<s>d</s>')
    expect(html).toMatch(/<code[^>]*>e<\/code>/)
  })

  it('link e menção continuam funcionando dentro do negrito; em código, não', () => {
    const html = render('**@ana veja https://x.com** `@bia`')
    expect(html).toMatch(/<strong><b data-chip="true">@ana<\/b> veja <a href="https:\/\/x.com"/)
    expect(html).toMatch(/<code[^>]*>@bia<\/code>/)
  })

  it('<https://…> vira link sem os sinais', () => {
    const html = render('<https://x.com/a>')
    expect(html).toContain('href="https://x.com/a"')
    expect(html).not.toContain('&lt;https')
  })

  it('títulos, citação, listas e subtexto', () => {
    const html = render('# T1\n## T2\n### T3\n> cit\n- a\n  - b\n3. c\n-# rodapé')
    expect(html).toMatch(/<h1[^>]*>T1<\/h1>/)
    expect(html).toMatch(/<h2[^>]*>T2<\/h2>/)
    expect(html).toMatch(/<h3[^>]*>T3<\/h3>/)
    expect(html).toMatch(/<blockquote[^>]*><p[^>]*>cit<\/p><\/blockquote>/)
    expect(html).toMatch(/<ul[^>]*><li>a<ul[^>]*><li>b<\/li><\/ul><\/li><\/ul>/)
    expect(html).toMatch(/<ol start="3"[^>]*><li>c<\/li><\/ol>/)
    expect(html).toMatch(/<small[^>]*>rodapé<\/small>/)
  })

  it('nunca vira HTML cru', () => {
    const html = render('**<img src=x onerror=alert(1)>**')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('emoji grande só em mensagem sem formatação', () => {
    expect(render(EMOJI)).toContain('data-emoji="jumbo"')
    expect(render(`**${EMOJI}**`)).toContain('data-emoji="inline"')
  })
})
