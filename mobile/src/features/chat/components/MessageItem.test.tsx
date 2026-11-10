import { fireEvent, render, screen } from '@testing-library/react-native'
import type { Message } from '../api/messages'
import type { GroupedMessage } from '../lib/messageGroups'
import { timeText } from '../lib/dayLabel'
import { MessageItem } from './MessageItem'

jest.mock('../store/mediaToken', () => ({ ensureMediaToken: jest.fn().mockResolvedValue('tk'), invalidateMediaToken: jest.fn() }))

const message = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  author_id: 'u1',
  author: { id: 'u1', username: 'ana', display_name: 'Ana Mobile' },
  content: 'olá, pessoal',
  created_at: '2026-10-28T09:05:00Z',
  ...over
})
const item = (over: Partial<GroupedMessage> = {}, msg: Message = message()): GroupedMessage => ({
  message: msg,
  showHeader: true,
  dayLabel: null,
  ...over
})

describe('MessageItem', () => {
  it('primeira do bloco: nome, hora (mensagem de hoje só mostra a hora) e texto', async () => {
    const created_at = new Date().toISOString()
    await render(<MessageItem item={item({}, message({ created_at }))} timeZone="UTC" />)
    expect(screen.getByText('Ana Mobile')).toBeOnTheScreen()
    expect(screen.getByText(timeText(created_at, 'UTC'))).toBeOnTheScreen()
    expect(screen.getByText('olá, pessoal')).toBeOnTheScreen()
  })

  it('mensagem antiga: data numérica e hora ao lado do nome', async () => {
    await render(<MessageItem item={item()} timeZone="UTC" />)
    expect(screen.getByText('28/10/2026 09:05')).toBeOnTheScreen()
  })

  it('encaminhada: o selo com a origem acima do texto da original', async () => {
    const forwarded_from = { message_id: 'm0', author_id: 'u2', author_name: 'Caio', channel_id: 'c1', channel_name: 'geral', created_at: '' }
    await render(<MessageItem item={item({}, message({ forwarded_from }))} timeZone="UTC" />)
    expect(screen.getByText('Encaminhada')).toBeOnTheScreen()
    expect(screen.getByText('de Caio · #geral')).toBeOnTheScreen()
    expect(screen.getByText('olá, pessoal')).toBeOnTheScreen()
  })

  it('continuação do bloco: só o texto', async () => {
    await render(<MessageItem item={item({ showHeader: false })} timeZone="UTC" />)
    expect(screen.queryByText('Ana Mobile')).toBeNull()
    expect(screen.getByText('olá, pessoal')).toBeOnTheScreen()
  })

  it('abre um dia novo: mostra o separador por extenso', async () => {
    await render(<MessageItem item={item({ dayLabel: '2026-10-28' })} timeZone="UTC" />)
    expect(screen.getByText('28 de outubro de 2026')).toBeOnTheScreen()
  })

  it('mensagem editada leva o marcador do desktop', async () => {
    await render(<MessageItem item={item({}, message({ edited_at: '2026-10-28T09:10:00Z' }))} timeZone="UTC" />)
    expect(screen.getByText('(editada)')).toBeOnTheScreen()
  })

  it('GIF sem texto: mostra o GIF e nenhum texto', async () => {
    await render(<MessageItem item={item({}, message({ content: '', gif_url: 'https://g/x.gif', gif_metadata: { width: 200, height: 100 } }))} timeZone="UTC" />)
    expect(screen.getByLabelText('GIF')).toBeOnTheScreen()
    expect(screen.queryByText('olá, pessoal')).toBeNull()
  })

  it('figurinha e anexos aparecem junto do texto', async () => {
    const msg = message({
      sticker: { id: 's1', server_id: 'sv', name: 'oi', content_type: 'image/png' },
      attachments: [{ id: 'a1', kind: 'audio', content_type: 'audio/mpeg', filename: 'voz.mp3', size_bytes: 2048 }]
    })
    await render(<MessageItem item={item({}, msg)} timeZone="UTC" />)
    expect(screen.getByText('olá, pessoal')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Ouvir voz.mp3' })).toBeOnTheScreen()
  })

  it('mensagem do Maestro (system_kind music): cartão do bot com o selo BOT', async () => {
    await render(<MessageItem item={item({}, message({ system_kind: 'music', content: '🎵 tocando **Boa noite**' }))} timeZone="UTC" />)
    expect(screen.getByText('BOT')).toBeOnTheScreen()
    expect(screen.getByText('Boa noite')).toBeOnTheScreen()
  })

  it('autor ausente: não quebra', async () => {
    await render(<MessageItem item={item({}, message({ author: undefined }))} timeZone="UTC" />)
    expect(screen.getByText('olá, pessoal')).toBeOnTheScreen()
  })

  it('tocar no nome ou na foto do autor abre o perfil dele', async () => {
    const onOpenProfile = jest.fn()
    await render(<MessageItem item={item()} timeZone="UTC" onOpenProfile={onOpenProfile} />)
    await fireEvent.press(screen.getByText('Ana Mobile'))
    await fireEvent.press(screen.getByText('A'))
    expect(onOpenProfile).toHaveBeenNthCalledWith(1, 'u1')
    expect(onOpenProfile).toHaveBeenNthCalledWith(2, 'u1')
  })

  it('sem onOpenProfile o nome não é um botão', async () => {
    await render(<MessageItem item={item()} timeZone="UTC" />)
    expect(screen.queryByRole('button', { name: 'Ana Mobile' })).toBeNull()
  })

  it('autor ausente: ainda abre o perfil pelo id da mensagem', async () => {
    const onOpenProfile = jest.fn()
    await render(
      <MessageItem item={item({}, message({ author: undefined, author_id: 'u7' }))} timeZone="UTC" onOpenProfile={onOpenProfile} />
    )
    await fireEvent.press(screen.getByText('Usuário'))
    expect(onOpenProfile).toHaveBeenCalledWith('u7')
  })

  it('figurinha apagada na origem mostra o :nome:', async () => {
    await render(<MessageItem item={item({}, message({ content: '', deleted_sticker_name: 'gato' }))} timeZone="UTC" />)
    expect(screen.getByText(':gato:')).toBeOnTheScreen()
  })
})
