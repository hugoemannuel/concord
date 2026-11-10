import { describe, expect, it } from 'vitest'
import type { Message } from '../api/messages'
import {
  applyMessageUpdate,
  canEditMessage,
  editErrorMessage,
  editOutcome,
  lastEditableMessage
} from './messageEdit'
import { messagePreview } from './polls'

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0)

function msg(id: string, n: number, extra: Partial<Message> = {}): Message {
  return {
    id,
    author_id: 'me',
    conversation_id: 'c1',
    content: id,
    created_at: new Date(T0 + n * 1000).toISOString(),
    ...extra
  }
}

const ids = (list: Message[]): string[] => list.map((m) => m.id)

describe('applyMessageUpdate', () => {
  it('troca o texto e mantém a posição pelo created_at', () => {
    const list = [msg('a', 1), msg('b', 2), msg('c', 3)]
    const next = applyMessageUpdate(list, {
      ...msg('a', 1),
      content: 'editada',
      edited_at: new Date(T0 + 60_000).toISOString()
    })
    expect(ids(next)).toEqual(['a', 'b', 'c'])
    expect(next[0].content).toBe('editada')
    expect(next[0].edited_at).toBeTruthy()
  })

  it('ordem vem do created_at mesmo se a cópia editada vier com o horário em outro formato', () => {
    const list = [msg('a', 1), msg('b', 2)]
    const iso = new Date(T0 + 1000).toISOString().replace('Z', '+00:00')
    const next = applyMessageUpdate(list, { ...msg('a', 1), created_at: iso, content: 'x' })
    expect(ids(next)).toEqual(['a', 'b'])
  })

  it('mensagem que não está carregada não entra na lista', () => {
    const list = [msg('a', 1)]
    expect(applyMessageUpdate(list, msg('z', 9))).toBe(list)
  })

  it('edição mais antiga que a da tela é ignorada (PATCH e WS em qualquer ordem)', () => {
    const newer = { ...msg('a', 1), content: 'v2', edited_at: new Date(T0 + 120_000).toISOString() }
    const older = { ...msg('a', 1), content: 'v1', edited_at: new Date(T0 + 60_000).toISOString() }
    const list = applyMessageUpdate([msg('a', 1)], newer)
    expect(applyMessageUpdate(list, older)[0].content).toBe('v2')
  })

  it('mantém a enquete, reações, sticker e gif_metadata locais quando a cópia não traz', () => {
    const poll = {
      question: 'q',
      answers: [],
      allow_multiselect: false,
      expires_at: new Date(T0).toISOString(),
      total_voters: 1
    }
    const reactions = [{ emoji: '👍', count: 1, user_ids: ['x'] }]
    const sticker = {
      id: 'stk-1',
      server_id: 'srv-1',
      name: 'festa',
      content_type: 'image/png'
    }
    const gif_metadata = { width: 320, height: 240, preview_url: 'https://media.giphy.com/p.gif' }
    const list = [msg('a', 1, { poll, reactions, sticker, gif_metadata })]
    const next = applyMessageUpdate(list, { ...msg('a', 1), content: 'x' })
    expect(next[0].poll).toBe(poll)
    expect(next[0].reactions).toBe(reactions)
    expect(next[0].sticker).toBe(sticker)
    expect(next[0].gif_metadata).toBe(gif_metadata)
  })

  it('atualiza a prévia das respostas à mensagem editada', () => {
    const list = [
      msg('a', 1),
      msg('b', 2, {
        reply_to_id: 'a',
        reply_to: { id: 'a', author_id: 'me', content: 'a' }
      })
    ]
    const next = applyMessageUpdate(list, { ...msg('a', 1), content: 'nova' })
    expect(next[1].reply_to?.content).toBe('nova')
  })
})

describe('canEditMessage / lastEditableMessage', () => {
  it('encaminhada não se edita (é a foto da original)', () => {
    const forwarded_from = { message_id: 'm0', author_id: 'bia', author_name: 'Bia', created_at: '' }
    expect(canEditMessage(msg('a', 1, { forwarded_from }), 'me')).toBe(false)
  })

  it('só a sua mensagem comum (sem sistema, sem enquete e sem figurinha pura)', () => {
    expect(canEditMessage(msg('a', 1), 'me')).toBe(true)
    expect(canEditMessage(msg('a', 1, { author_id: 'outro' }), 'me')).toBe(false)
    expect(canEditMessage(msg('a', 1, { system_kind: 'birthday' }), 'me')).toBe(false)
    expect(
      canEditMessage(msg('a', 1, { call_invite: { call_id: 'c1', channel_id: 'ch' } }), 'me')
    ).toBe(false)
    expect(
      canEditMessage(
        msg('a', 1, {
          content: '',
          poll: {
            question: 'q',
            answers: [],
            allow_multiselect: false,
            expires_at: '',
            total_voters: 0
          }
        }),
        'me'
      )
    ).toBe(false)
    expect(
      canEditMessage(
        msg('a', 1, {
          content: '',
          sticker_id: 'stk-1'
        }),
        'me'
      )
    ).toBe(false)
    expect(
      canEditMessage(
        msg('a', 1, {
          content: 'legenda da figurinha',
          sticker_id: 'stk-1'
        }),
        'me'
      )
    ).toBe(true)
    expect(
      canEditMessage(
        msg('a', 1, {
          content: 'legenda do gif',
          gif_url: 'https://media.giphy.com/media/123/giphy.gif'
        }),
        'me'
      )
    ).toBe(true)
    expect(canEditMessage(msg('a', 1), undefined)).toBe(false)
  })

  it('↑ pega a sua última mensagem editável (ignorando figurinha sem texto)', () => {
    const list = [
      msg('a', 1),
      msg('b', 2),
      msg('c', 3, { author_id: 'outro' }),
      msg('d', 4, { system_kind: 'birthday' }),
      msg('e', 5, { content: '', sticker_id: 'stk-1' })
    ]
    expect(lastEditableMessage(list, 'me')?.id).toBe('b')
    expect(lastEditableMessage([msg('c', 3, { author_id: 'outro' })], 'me')).toBeNull()
  })
})

describe('editOutcome', () => {
  it('mesmo texto (ou só espaços a mais) só fecha', () => {
    expect(editOutcome('oi', 'oi', false)).toEqual({ kind: 'unchanged' })
    expect(editOutcome('oi', '  oi \n', false)).toEqual({ kind: 'unchanged' })
  })

  it('salva o texto aparado', () => {
    expect(editOutcome('oi', ' oi, gente \n', false)).toEqual({
      kind: 'save',
      content: 'oi, gente'
    })
  })

  it('texto vazio: só com anexo, figurinha ou GIF', () => {
    expect(editOutcome('oi', '  ', false)).toEqual({ kind: 'empty' })
    expect(editOutcome('oi', '  ', true)).toEqual({ kind: 'save', content: '' })
  })
})

describe('editErrorMessage', () => {
  it('traduz os erros da edição', () => {
    expect(editErrorMessage({ status: 403, code: 'not_author', message: 'x' })).toBe(
      'Só quem escreveu a mensagem pode editar.'
    )
    expect(editErrorMessage({ status: 404, message: 'message not found' })).toBe(
      'Essa mensagem não existe mais.'
    )
    expect(editErrorMessage({ status: 400, message: 'content is too long' })).toBe(
      'A mensagem passou do limite de caracteres.'
    )
    expect(editErrorMessage({ status: 400, message: 'content is required' })).toBe(
      'A mensagem não pode ficar vazia.'
    )
    expect(editErrorMessage({ status: 400, message: 'this message cannot be edited' })).toBe(
      'Essa mensagem não pode ser editada.'
    )
  })

  it('o resto (cargo, bloqueio, rede) fica com o tratamento geral', () => {
    expect(editErrorMessage({ status: 403, code: 'missing_permission', message: 'x' })).toBeNull()
    expect(editErrorMessage(new Error('rede'))).toBeNull()
  })
})

describe('messagePreview para figurinhas e GIFs', () => {
  it('exibe prévia amigável para figurinha e GIF quando não há texto', () => {
    expect(
      messagePreview({
        content: '',
        sticker_id: 'stk-1',
        sticker: {
          id: 'stk-1',
          server_id: 'srv-1',
          name: 'festa',
          content_type: 'image/png'
        }
      })
    ).toBe('💟 Figurinha :festa:')
    expect(messagePreview({ content: '', sticker_id: 'stk-1' })).toBe('💟 Figurinha')
    expect(messagePreview({ content: '', gif_url: 'https://media.giphy.com/1.gif' })).toBe('👾 GIF')
    expect(
      messagePreview({ content: 'Olha isso', gif_url: 'https://media.giphy.com/1.gif' })
    ).toBe('Olha isso')
  })
})
