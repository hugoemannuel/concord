import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChannelCategorySelect } from './ChannelCategoryPicker'

describe('categoria na criação do canal', () => {
  it('lista categorias e deixa a escolha opcional', () => {
    const html = renderToStaticMarkup(<ChannelCategorySelect categories={[{ id: 'cat', name: 'Jogos', position: 0 }]} value="cat" onChange={vi.fn()} />)
    expect(html).toContain('Categoria')
    expect(html).toContain('Sem categoria')
    expect(html).toContain('<option value="cat" selected="">Jogos</option>')
    expect(html).toContain('name="category_id"')
  })
  it('sem categorias permite criar sem agrupamento', () => {
    const html = renderToStaticMarkup(<ChannelCategorySelect categories={[]} value="" onChange={vi.fn()} />)
    expect(html).toContain('<option value="" selected="">Sem categoria</option>')
  })
})
