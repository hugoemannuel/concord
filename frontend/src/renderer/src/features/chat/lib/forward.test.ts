import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import type { ConversationSummary } from '../api/conversations'
import type { Message } from '../api/messages'
import { SALINHA_BOT_USER_ID } from '../../music/lib/bots'
import {
  canForward,
  filterDestinations,
  forwardDestinations,
  forwardErrorMessage,
  forwardOrigin
} from './forward'

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  author_id: 'ana',
  channel_id: 'c1',
  content: 'oi',
  created_at: '2026-11-09T12:00:00Z',
  ...over
})

const conv = (over: Partial<ConversationSummary>): ConversationSummary => ({
  id: 'dm1',
  type: 'dm',
  name: '',
  created_at: '',
  updated_at: '',
  members: [],
  unread_count: 0,
  ...over
})

describe('canForward', () => {
  it('encaminha texto, anexo, figurinha e GIF', () => {
    expect(canForward(msg())).toBe(true)
    expect(canForward(msg({ content: '', attachments: [{ id: 'a', kind: 'image', content_type: 'image/png', filename: 'a.png', size_bytes: 1 }] }))).toBe(true)
    expect(canForward(msg({ content: '', sticker_id: 's1' }))).toBe(true)
    expect(canForward(msg({ content: '', gif_url: 'https://g.gif' }))).toBe(true)
  })

  it('não encaminha enquete, convite para call, aviso do sistema nem mensagem vazia', () => {
    const poll = { question: 'q', answers: [], allow_multiselect: false, expires_at: '', total_voters: 0 }
    expect(canForward(msg({ poll }))).toBe(false)
    expect(canForward(msg({ call_invite: { call_id: 'c', channel_id: 'v' } }))).toBe(false)
    expect(canForward(msg({ system_kind: 'birthday' }))).toBe(false)
    expect(canForward(msg({ content: '   ' }))).toBe(false)
  })

  it('não encaminha visualização única, nem com legenda', () => {
    const view_once = { id: 'a1', kind: 'image' as const, gone: false, viewer_ids: [], recipient_ids: ['b'], recipient_count: 1 }
    expect(canForward(msg({ content: 'olha', view_once }))).toBe(false)
  })
})

describe('forwardOrigin', () => {
  const base = { message_id: 'm0', author_id: 'ana', author_name: 'Ana', created_at: '' }

  it('canal: #canal e o servidor', () => {
    expect(forwardOrigin({ ...base, channel_id: 'c1', channel_name: 'geral', server_name: 'Salinha' })).toEqual({
      author: 'Ana',
      place: '#geral · Salinha'
    })
  })

  it('canal sem o nome do servidor, e DM', () => {
    expect(forwardOrigin({ ...base, channel_id: 'c1', channel_name: 'geral' }).place).toBe('#geral')
    expect(forwardOrigin({ ...base, conversation_id: 'dm1' }).place).toBe('Mensagem direta')
  })

  it('sem nome do autor, o @usuário; sem nada, "Alguém"', () => {
    expect(forwardOrigin({ ...base, author_name: '', author_username: 'ana' }).author).toBe('ana')
    expect(forwardOrigin({ ...base, author_name: '' }).author).toBe('Alguém')
  })
})

describe('forwardDestinations', () => {
  const servers = [
    { id: 's1', name: 'Salinha', icon_url: 'i.png', channels: [{ id: 'c1', name: 'geral' }, { id: 'c2', name: 'memes' }] }
  ]
  const conversations = [
    conv({ id: 'dm1', other_user: { id: 'bia', username: 'bia', display_name: 'Bia' } }),
    conv({ id: 'dm-bot', other_user: { id: SALINHA_BOT_USER_ID, username: 'salinha', display_name: 'Salinha Bot' } }),
    conv({ id: 'g1', type: 'group', name: 'Turma', members: [] })
  ]

  it('conversas primeiro (menos a DM do bot, que é só leitura), depois os canais', () => {
    const got = forwardDestinations(servers, conversations, 'eu')
    expect(got.map((d) => d.key)).toEqual(['conversation:dm1', 'conversation:g1', 'channel:c1', 'channel:c2'])
    expect(got[0]).toMatchObject({ label: 'Bia', hint: 'bia', target: { conversation_id: 'dm1' } })
    expect(got[1]).toMatchObject({ label: 'Turma', hint: 'Grupo' })
    expect(got[2]).toMatchObject({ label: '#geral', hint: 'Salinha', target: { channel_id: 'c1' }, iconUrl: 'i.png' })
  })

  it('filtra pelo nome e pelo servidor, sem acento nem caixa', () => {
    const all = forwardDestinations(servers, conversations, 'eu')
    expect(filterDestinations(all, 'MEME').map((d) => d.key)).toEqual(['channel:c2'])
    expect(filterDestinations(all, 'sálinha').map((d) => d.key)).toEqual(['channel:c1', 'channel:c2'])
    expect(filterDestinations(all, '  ')).toHaveLength(4)
  })
})

describe('forwardErrorMessage', () => {
  it('traduz o erro do servidor', () => {
    expect(forwardErrorMessage(new ApiError(403, 'x', 'blocked'))).toBe('Você não pode enviar mensagens para essa pessoa.')
    expect(forwardErrorMessage(new ApiError(403, 'x', 'bot_conversation'))).toBe('Essa conversa é só de leitura.')
    expect(forwardErrorMessage(new ApiError(403, 'x'))).toBe('Você não tem permissão para enviar mensagens aí.')
    expect(forwardErrorMessage(new ApiError(404, 'x'))).toBe('A mensagem ou o destino não existe mais.')
    expect(forwardErrorMessage(new ApiError(400, 'x', 'not_forwardable'))).toBe('Essa mensagem não pode ser encaminhada.')
    expect(forwardErrorMessage(new ApiError(507, 'x'))).toBe('O servidor está sem espaço para os arquivos.')
    expect(forwardErrorMessage(new Error('rede'))).toBe('Não foi possível encaminhar a mensagem.')
  })

  it('modo lento no destino: diz quanto falta', () => {
    const err = new ApiError(429, 'slowmode: retry after 30s', 'slowmode', { retry_after: 30 })
    expect(forwardErrorMessage(err)).toBe('Modo lento: aguarde 30 s para mandar outra mensagem.')
  })
})
