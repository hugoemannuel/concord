import { fireEvent, render, screen } from '@testing-library/react-native'
import type { Channel } from '../api/channels'
import { ChannelList } from './ChannelList'

const ch = (id: string, name: string, type: 'text' | 'voice'): Channel => ({
  id,
  server_id: 's',
  name,
  type,
  created_by: 'u',
  created_at: '',
  updated_at: ''
})
const channels = [ch('t1', 'geral', 'text'), ch('v1', 'sala-1', 'voice')]
const base = { serverName: 'BH RX', error: false, onOpenChannel: () => {}, onRetry: () => {} }

describe('ChannelList', () => {
  it('mostra o servidor e as seções de texto e voz', async () => {
    await render(<ChannelList {...base} channels={channels} />)
    expect(screen.getByText('BH RX')).toBeOnTheScreen()
    expect(screen.getByText('Canais de texto')).toBeOnTheScreen()
    expect(screen.getByText('Canais de voz')).toBeOnTheScreen()
  })

  it('com a organização, mostra as categorias e os canais soltos sem título', async () => {
    const layout = {
      categories: [{ id: 'jogos', name: 'Jogos', position: 0 }],
      channels: [
        { channel_id: 't1', category_id: null, position: 0 },
        { channel_id: 'v1', category_id: 'jogos', position: 0 }
      ]
    }
    await render(<ChannelList {...base} channels={channels} layout={layout} />)
    expect(screen.getByText('Jogos')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'geral' })).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'sala-1' })).toBeOnTheScreen()
    expect(screen.queryByText('Canais de texto')).toBeNull()
  })

  it('tocar num canal de texto abre ele', async () => {
    const onOpenChannel = jest.fn()
    await render(<ChannelList {...base} channels={channels} onOpenChannel={onOpenChannel} />)
    await fireEvent.press(screen.getByRole('button', { name: 'geral' }))
    expect(onOpenChannel).toHaveBeenCalledWith(expect.objectContaining({ id: 't1' }))
  })

  it('tocar num canal de voz entra na chamada em vez de abrir chat', async () => {
    const onOpenChannel = jest.fn()
    const onJoinVoice = jest.fn()
    await render(<ChannelList {...base} channels={channels} onOpenChannel={onOpenChannel} onJoinVoice={onJoinVoice} />)
    await fireEvent.press(screen.getByRole('button', { name: 'sala-1' }))
    expect(onOpenChannel).not.toHaveBeenCalled()
    expect(onJoinVoice).toHaveBeenCalledWith(expect.objectContaining({ id: 'v1' }))
  })

  it('mostra embaixo do canal de voz quem está nele', async () => {
    const ana = { id: 'u1', username: 'ana', display_name: 'Ana' }
    await render(<ChannelList {...base} channels={channels} voiceMembers={{ v1: [ana] }} />)
    expect(screen.getByText('Ana')).toBeOnTheScreen()
  })

  it('canal com mensagem não lida ganha o ponto; os outros não', async () => {
    await render(<ChannelList {...base} channels={[ch('t1', 'geral', 'text'), ch('t2', 'avisos', 'text')]} unreadChannels={{ t2: 4 }} />)
    expect(screen.getAllByLabelText('Mensagens não lidas')).toHaveLength(1)
  })

  it('falha ao carregar os canais: oferece tentar de novo', async () => {
    const onRetry = jest.fn()
    await render(<ChannelList {...base} channels={[]} error onRetry={onRetry} />)
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(onRetry).toHaveBeenCalled()
  })
})
