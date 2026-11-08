import { describe, expect, it, vi } from 'vitest'

vi.mock('../../servers/hooks/useServerNames', () => ({ useServerMemberColor: () => undefined }))
vi.mock('../../../shared/ui/Avatar', () => ({ default: () => <i data-avatar /> }))

import { renderToStaticMarkup } from 'react-dom/server'
import type { SearchResult } from '../api/search'
import SearchResultItem from './SearchResultItem'

const result = (over: Partial<SearchResult>): SearchResult =>
  ({
    id: 'm1',
    author_id: 'u1',
    author: { id: 'u1', username: 'ana', display_name: 'Ana' },
    content: 'pizza hoje',
    created_at: '2026-10-25T12:00:00Z',
    attachments: [],
    ...over
  }) as SearchResult

const render = (r: SearchResult): string =>
  renderToStaticMarkup(<SearchResultItem result={r} terms={['pizza']} onOpen={() => {}} />)

describe('SearchResultItem', () => {
  it('texto formatado aparece sem os símbolos, ainda com o termo marcado', () => {
    const html = render(result({ content: '**pizza** hoje' }))
    expect(html).not.toContain('**')
    expect(html).toContain('pizza</mark>')
  })

  it('texto com o termo marcado, autor e canal', () => {
    const html = render(result({ channel_name: 'geral' }))
    expect(html).toContain('<mark')
    expect(html).toContain('Ana')
    expect(html).toContain('geral')
  })

  it('só anexo: a prévia com ícone no lugar do texto, sem emoji', () => {
    const html = render(result({ content: '', attachments: [{ kind: 'image' }] as SearchResult['attachments'] }))
    expect(html).not.toContain('🖼')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"(?:(?!<\/svg>).)*<\/svg><span class="truncate">Imagem<\/span>/)
  })

  it('texto com enquete: a pergunta vem embaixo, com o ícone', () => {
    const html = render(result({ poll: { question: 'Pizza?' } } as Partial<SearchResult>))
    expect(html).not.toContain('📊')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"(?:(?!<\/svg>).)*<\/svg><span class="truncate">Pizza\?<\/span>/)
  })
})
