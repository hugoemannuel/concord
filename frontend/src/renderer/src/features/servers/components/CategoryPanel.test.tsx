import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Channel } from '../api/channels'
import { CategoryPanel } from './CategoryPanel'

vi.mock('../hooks/useCollapsedCategories', () => ({ useCollapsedCategories: () => [[], vi.fn()] }))

const channels = [
  { id: 'a', name: 'geral', type: 'text' },
  { id: 'b', name: 'voz', type: 'voice' },
  { id: 'c', name: 'livre', type: 'text' }
] as Channel[]
const layout = {
  categories: [{ id: 'cat', name: 'Jogos', position: 0 }],
  channels: [{ channel_id: 'a', category_id: 'cat', position: 0 }, { channel_id: 'b', category_id: 'cat', position: 1 }]
}

describe('CategoryPanel', () => {
  it('mostra canais de texto e voz na categoria e mantém os demais visíveis', () => {
    const html = renderToStaticMarkup(<CategoryPanel serverId="s" userId="u" layout={layout} channels={channels} canManage
      run={async () => true} onCreateChannel={vi.fn()} fallback={(_create, ungrouped) => <div>seções anteriores{ungrouped?.map((channel) => <p key={channel.id}>{channel.name}</p>)}</div>}
      renderChannel={(channel, _group, _index, controls) => <div>{channel.name}{controls}</div>} />)
    expect(html).toContain('Jogos')
    expect(html).toContain('geral')
    expect(html).toContain('voz')
    expect(html).toContain('livre')
    expect(html).not.toContain('>Criar categoria</button>')
    expect(html).toContain('Categoria do canal geral')
    expect(html).toContain('seções anteriores')
    expect(html).not.toContain('>Sem categoria</p>')
  })
  it('mantém a apresentação anterior quando não há categorias', () => {
    const html = renderToStaticMarkup(<CategoryPanel serverId="s" userId="u" layout={{ categories: [], channels: [] }} channels={channels} canManage={false}
      run={async () => true} onCreateChannel={vi.fn()} fallback={() => <p>seções anteriores</p>} renderChannel={() => null} />)
    expect(html).toContain('seções anteriores')
    expect(html).not.toContain('Criar categoria')
  })
  it('criar uma categoria vazia mantém todos os canais nas seções anteriores', () => {
    const previousSections = vi.fn((_create: () => void, ungrouped: Channel[]) => <div>Canais de texto e voz{ungrouped.map((channel) => <p key={channel.id}>{channel.name}</p>)}</div>)
    const html = renderToStaticMarkup(<CategoryPanel serverId="s" userId="u" layout={{ categories: layout.categories, channels: [] }} channels={channels} canManage
      run={async () => true} onCreateChannel={vi.fn()} fallback={previousSections} renderChannel={() => <p>movido indevidamente</p>} />)
    expect(previousSections).toHaveBeenCalledWith(expect.any(Function), expect.arrayContaining(channels.map((channel) => expect.objectContaining({ id: channel.id }))), expect.any(Function))
    expect(html).toContain('Canais de texto e voz')
    expect(html).toContain('geral')
    expect(html).toContain('voz')
    expect(html).not.toContain('movido indevidamente')
    expect(html).not.toContain('Sem categoria')
  })
  it('sem categorias respeita a ordem dos canais, mesmo com posições antigas no layout', () => {
    const reordered = [channels[1], channels[0], channels[2]]
    const previousSections = vi.fn(() => <div />)
    renderToStaticMarkup(<CategoryPanel serverId="s" userId="u" layout={{ categories: [], channels: layout.channels }} channels={reordered} canManage
      run={async () => true} onCreateChannel={vi.fn()} fallback={previousSections} renderChannel={() => null} />)
    expect(previousSections).toHaveBeenCalledWith(expect.any(Function), [
      { ...channels[1], category_id: null }, { ...channels[0], category_id: null }, { ...channels[2], category_id: null }
    ], expect.any(Function))
  })
})
