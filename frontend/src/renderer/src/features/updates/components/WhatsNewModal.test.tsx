import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { WhatsNewContent } from './WhatsNewModal'

const groups = [
  { version: '1.2.0', features: ['Chat com tópicos'], fixes: ['Som voltou'] },
  { version: '1.1.10', features: ['Temas novos'], fixes: [] }
]

describe('WhatsNewContent', () => {
  it('lista os destaques por versão, com as duas ações', () => {
    const html = renderToStaticMarkup(
      <WhatsNewContent groups={groups} onClose={() => {}} onSeeAll={() => {}} />
    )
    expect(html).toContain('v1.2.0')
    expect(html).toContain('Chat com tópicos')
    expect(html).toContain('Som voltou')
    expect(html).toContain('v1.1.10')
    expect(html).toContain('Ver todas as novidades')
    expect(html).toContain('Entendi')
  })

  it('versão sem correções não mostra o rótulo Correções', () => {
    const html = renderToStaticMarkup(
      <WhatsNewContent groups={[groups[1]]} onClose={() => {}} onSeeAll={() => {}} />
    )
    expect(html).not.toContain('Correções')
  })
})
