import type { Channel, ChannelLayout } from '../api/channels'
import { channelSections } from './channelSections'

const ch = (id: string, type: 'text' | 'voice', position = 0): Channel => ({
  id,
  server_id: 's',
  name: id,
  type,
  position,
  created_by: 'u',
  created_at: '',
  updated_at: ''
})

describe('channelSections', () => {
  it('separa texto e voz, respeitando a ordem que o servidor mandou', () => {
    const sections = channelSections([ch('t2', 'text', 1), ch('v1', 'voice', 0), ch('t1', 'text', 0)])
    expect(sections.map((s) => [s.key, s.channels.map((c) => c.id)])).toEqual([
      ['text', ['t1', 't2']],
      ['voice', ['v1']]
    ])
  })

  it('seção sem canais não aparece', () => {
    expect(channelSections([ch('t1', 'text')]).map((s) => s.key)).toEqual(['text'])
    expect(channelSections([])).toEqual([])
  })

  it('rótulos do desktop', () => {
    const [text, voice] = channelSections([ch('t', 'text'), ch('v', 'voice')])
    expect(text.title).toBe('Canais de texto')
    expect(voice.title).toBe('Canais de voz')
  })

  describe('com a organização do servidor', () => {
    const layout: ChannelLayout = {
      categories: [
        { id: 'jogos', name: 'Jogos', position: 0 },
        { id: 'vazia', name: 'Vazia', position: 1 }
      ],
      channels: [
        { channel_id: 'v1', category_id: null, position: 0 },
        { channel_id: 't1', category_id: null, position: 1 },
        { channel_id: 't2', category_id: 'jogos', position: 1 },
        { channel_id: 'v2', category_id: 'jogos', position: 0 }
      ]
    }
    const channels = [ch('t1', 'text'), ch('t2', 'text'), ch('v1', 'voice'), ch('v2', 'voice')]
    const shape = (sections: ReturnType<typeof channelSections>) => sections.map((s) => [s.title, s.channels.map((c) => c.id)])

    it('soltos no topo, sem título, texto e voz misturados; depois as categorias', () => {
      expect(shape(channelSections(channels, layout))).toEqual([
        [null, ['v1', 't1']],
        ['Jogos', ['v2', 't2']],
        ['Vazia', []]
      ])
    })
    it('sem canal solto, a lista começa na primeira categoria', () => {
      const organized = { ...layout, channels: layout.channels.filter((item) => item.category_id) }
      expect(channelSections([ch('t2', 'text')], organized)[0].title).toBe('Jogos')
    })
    it('canal novo, ainda sem lugar, aparece solto e no fim', () => {
      expect(channelSections([...channels, ch('novo', 'text')], layout)[0].channels.map((c) => c.id)).toEqual(['v1', 't1', 'novo'])
    })
    it('o que o servidor não mandou não aparece: categoria privada nem chega', () => {
      const semPermissao = { categories: [], channels: [{ channel_id: 't1', category_id: null, position: 0 }] }
      const sections = shape(channelSections([ch('t1', 'text')], semPermissao))
      expect(sections).toEqual([[null, ['t1']]])
    })
    it('canal apontando para categoria que não veio não some', () => {
      const stray = { categories: [], channels: [{ channel_id: 't1', category_id: 'sumiu', position: 0 }] }
      expect(shape(channelSections([ch('t1', 'text')], stray))).toEqual([[null, ['t1']]])
    })
    it('servidor sem categoria nenhuma funciona', () => {
      expect(shape(channelSections([ch('t1', 'text')], { categories: [], channels: [] }))).toEqual([[null, ['t1']]])
    })
  })
})
