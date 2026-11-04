import { getChannelLayout, listChannels, type Channel } from '../api/channels'
import { listServers, type Server } from '../api/servers'
import { useServersStore } from './serversStore'

jest.mock('../api/servers')
jest.mock('../api/channels')

const servers = jest.mocked(listServers)
const channels = jest.mocked(listChannels)
const layout = jest.mocked(getChannelLayout)
const srv = (id: string): Server => ({ id, name: id, owner_id: 'u' })
const ch = (id: string, serverId: string): Channel => ({
  id,
  server_id: serverId,
  name: id,
  type: 'text',
  created_by: 'u',
  created_at: '',
  updated_at: ''
})
const state = () => useServersStore.getState()

describe('serversStore', () => {
  beforeEach(() => {
    jest.resetAllMocks()
    useServersStore.setState(useServersStore.getInitialState(), true)
    layout.mockResolvedValue({ categories: [], channels: [] })
  })

  it('load guarda os servidores e termina "ready"', async () => {
    servers.mockResolvedValue([srv('a'), srv('b')])
    await state().load()
    expect(state().servers.map((s) => s.id)).toEqual(['a', 'b'])
    expect(state().status).toBe('ready')
  })

  it('falha do servidor: status "error" e mantém o que já tinha', async () => {
    servers.mockResolvedValueOnce([srv('a')])
    await state().load()
    servers.mockRejectedValueOnce(new Error('rede'))
    await state().load()
    expect(state().status).toBe('error')
    expect(state().servers).toHaveLength(1)
  })

  it('loadChannels guarda por servidor', async () => {
    channels.mockResolvedValue([ch('c1', 'a')])
    await state().loadChannels('a')
    expect(state().channelsByServer['a'].map((c) => c.id)).toEqual(['c1'])
  })

  it('loadChannels guarda também a organização', async () => {
    channels.mockResolvedValue([ch('c1', 'a')])
    layout.mockResolvedValue({ categories: [{ id: 'x', name: 'Jogos', position: 0 }], channels: [] })
    await state().loadChannels('a')
    expect(state().layoutByServer['a']?.categories[0].name).toBe('Jogos')
  })

  it('sem a organização, os canais continuam aparecendo', async () => {
    channels.mockResolvedValue([ch('c1', 'a')])
    layout.mockRejectedValue(new Error('rede'))
    await state().loadChannels('a')
    expect(state().channelsByServer['a'].map((c) => c.id)).toEqual(['c1'])
    expect(state().layoutByServer['a']).toBeNull()
    expect(state().channelsError['a']).toBe(false)
  })

  it('falha ao carregar canais não derruba: lista fica vazia e marca erro do servidor', async () => {
    channels.mockRejectedValue(new Error('x'))
    await state().loadChannels('a')
    expect(state().channelsByServer['a']).toEqual([])
    expect(state().channelsError['a']).toBe(true)
  })

  it('reset limpa tudo (logout)', async () => {
    servers.mockResolvedValue([srv('a')])
    await state().load()
    state().reset()
    expect(state().servers).toEqual([])
    expect(state().status).toBe('idle')
  })
})
