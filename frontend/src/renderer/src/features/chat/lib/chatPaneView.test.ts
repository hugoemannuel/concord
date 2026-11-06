import { describe, expect, it } from 'vitest'
import type { Message, PinnedMessage } from '../api/messages'
import { DIRECT_CHAT_PERMISSIONS } from './chatPermissions'
import {
  mentionPeople,
  channelIdOf,
  composerCommands,
  composerDisabledReason,
  composerPlaceholder,
  inRoom,
  mentionMenu,
  messageAuthorName,
  morePinsLabel,
  jumpEventTarget,
  pinnedPreview,
  readyJump,
  submitLabel
} from './chatPaneView'

describe('channelIdOf', () => {
  it('sala de canal: o id do canal', () => {
    expect(channelIdOf('channel:abc')).toBe('abc')
  })

  it('DM e grupo: sem canal', () => {
    expect(channelIdOf('conversation:abc')).toBeNull()
  })
})

describe('composerDisabledReason', () => {
  it('o aviso passado pela tela vale primeiro (ex.: DM com alguém bloqueado)', () => {
    expect(composerDisabledReason('Bloqueado', DIRECT_CHAT_PERMISSIONS)).toBe('Bloqueado')
  })

  it('sem aviso: só aparece quando falta permissão de enviar', () => {
    expect(composerDisabledReason(undefined, DIRECT_CHAT_PERMISSIONS)).toBeUndefined()
    expect(
      composerDisabledReason(undefined, { ...DIRECT_CHAT_PERMISSIONS, canSend: false })
    ).toMatch(/não tem permissão/)
  })
})

describe('inRoom', () => {
  it('o estado é desta sala: devolve o campo', () => {
    expect(inRoom({ room: 'channel:1', id: 'm1' }, 'channel:1', 'id')).toBe('m1')
  })

  it('o estado é de outra sala, ou não há estado: null', () => {
    expect(inRoom({ room: 'channel:1', id: 'm1' }, 'channel:2', 'id')).toBeNull()
    expect(inRoom<{ room: string; id: string }, 'id'>(null, 'channel:1', 'id')).toBeNull()
  })
})

describe('mentionMenu', () => {
  const users = [
    { username: 'ana', display_name: 'Ana' },
    { username: 'bia', display_name: 'Bia' }
  ]

  it('sem @ em digitação: sem sugestões', () => {
    expect(mentionMenu(null, null, users, false, undefined, 6)).toEqual({
      suggestions: [],
      highlight: -1
    })
  })

  it('com @: sugere e destaca o item padrão até a pessoa escolher outro', () => {
    const menu = mentionMenu({ query: 'a', start: 0 }, null, users, false, undefined, 6)
    expect(menu.suggestions.map((s) => s.username)).toEqual(['ana'])
    expect(menu.highlight).toBe(0)
    expect(mentionMenu({ query: '', start: 0 }, 1, users, false, undefined, 6).highlight).toBe(1)
  })

  it('não sugere a própria pessoa', () => {
    const menu = mentionMenu({ query: '', start: 0 }, null, users, false, 'ana', 6)
    expect(menu.suggestions.map((s) => s.username)).toEqual(['bia'])
  })
})

describe('messageAuthorName', () => {
  const message = {
    author_id: 'u1',
    author: { id: 'u1', username: 'ana', display_name: 'Ana' }
  } as Message

  it('apelido no servidor vale primeiro', () => {
    expect(messageAuthorName(message, { u1: 'Aninha' })).toBe('Aninha')
  })

  it('sem apelido: o nome de exibição', () => {
    expect(messageAuthorName(message, undefined)).toBe('Ana')
  })

  it('sem mensagem: o nome padrão', () => {
    expect(messageAuthorName(null, { u1: 'Aninha' })).toBe('Usuário')
  })
})

describe('pinnedPreview', () => {
  const pin = (extra: Partial<PinnedMessage>): PinnedMessage =>
    ({ id: 'p', author_id: 'u1', content: '', pinned_at: '', ...extra }) as PinnedMessage

  it('figurinha e GIF', () => {
    expect(pinnedPreview(pin({ sticker: { name: 'gato' } as PinnedMessage['sticker'] }))).toEqual({
      icon: 'sticker',
      text: 'Figurinha :gato:'
    })
    expect(pinnedPreview(pin({ gif_url: 'https://g' }))).toEqual({ icon: 'gif', text: 'GIF' })
  })

  it('texto (sem espaços nas pontas)', () => {
    expect(pinnedPreview(pin({ content: '  oi  ' }))).toEqual({ icon: null, text: 'oi' })
  })

  it('anexo pelo tipo do primeiro', () => {
    const attachment = (kind: string): PinnedMessage =>
      pin({ attachments: [{ kind }] as PinnedMessage['attachments'] })
    expect(pinnedPreview(attachment('image'))).toEqual({ icon: 'image', text: 'Imagem' })
    expect(pinnedPreview(attachment('video'))).toEqual({ icon: 'video', text: 'Vídeo' })
    expect(pinnedPreview(attachment('audio'))).toEqual({ icon: 'audio', text: 'Áudio' })
    expect(pinnedPreview(attachment('file'))).toEqual({ icon: 'attachment', text: 'Anexo' })
  })

  it('enquete e o resto', () => {
    expect(pinnedPreview(pin({ poll: { question: 'Pizza?' } as PinnedMessage['poll'] }))).toEqual({
      icon: 'poll',
      text: 'Enquete: Pizza?'
    })
    expect(pinnedPreview(pin({}))).toEqual({ icon: null, text: 'Mensagem fixada' })
  })
})

describe('morePinsLabel', () => {
  it('só a mais recente: nada', () => {
    expect(morePinsLabel(1)).toBeNull()
    expect(morePinsLabel(0)).toBeNull()
  })

  it('conta as outras, no singular e no plural', () => {
    expect(morePinsLabel(2)).toBe('+1 fixada')
    expect(morePinsLabel(4)).toBe('+3 fixadas')
  })
})

describe('composerPlaceholder', () => {
  it('respondendo: chama a pessoa', () => {
    expect(composerPlaceholder(true, 'ana', 'Mensagem para #geral')).toBe('Responder a @ana…')
  })

  it('sem resposta: o texto da tela', () => {
    expect(composerPlaceholder(false, 'Usuário', 'Mensagem para #geral')).toBe(
      'Mensagem para #geral'
    )
  })
})

describe('submitLabel', () => {
  it('subindo arquivo, enviando ou pronto', () => {
    expect(submitLabel(true, true)).toBe('Enviando arquivos…')
    expect(submitLabel(false, true)).toBe('Enviando…')
    expect(submitLabel(false, false)).toBe('Enviar')
  })
})

describe('readyJump', () => {
  const jump = { room: 'channel:1', messageId: 'm9' }

  it('pedido de pulo desta sala, já carregada: a mensagem a buscar', () => {
    expect(readyJump(jump, 'channel:1', false)).toBe('m9')
  })

  it('sem pedido, de outra sala ou ainda carregando: espera', () => {
    expect(readyJump(null, 'channel:1', false)).toBeNull()
    expect(readyJump(jump, 'channel:2', false)).toBeNull()
    expect(readyJump(jump, 'channel:1', true)).toBeNull()
  })
})

describe('jumpEventTarget', () => {
  it('evento concord:jump-to-message com a mensagem', () => {
    expect(jumpEventTarget(new CustomEvent('x', { detail: { messageId: 'm1' } }))).toBe('m1')
  })

  it('evento sem mensagem: nada', () => {
    expect(jumpEventTarget(new CustomEvent('x'))).toBeNull()
    expect(jumpEventTarget(new CustomEvent('x', { detail: {} }))).toBeNull()
  })
})

describe('composerCommands', () => {
  it('canal: comandos do Maestro e, com a permissão, o /tts', () => {
    expect(composerCommands(true, true).map((c) => c.command)).toEqual([
      '/play',
      '/skip',
      '/fila',
      '/help',
      '/tts'
    ])
    expect(composerCommands(true, false).map((c) => c.command)).not.toContain('/tts')
  })
  it('DM: só o /tts', () => {
    expect(composerCommands(false, true).map((c) => c.command)).toEqual(['/tts'])
    expect(composerCommands(false, false)).toEqual([])
  })
})

describe('mentionPeople', () => {
  const ana = { username: 'ana', display_name: 'Ana' }
  const me = { id: 'eu', username: 'eu', display_name: 'Eu' }
  const fromBia = {
    id: 'm1',
    author_id: 'bia',
    author: { username: 'bia', display_name: 'Bia' },
    content: 'oi',
    created_at: '2026-01-01T10:00:00Z'
  } as Message
  const system = { ...fromBia, id: 'm2', author: undefined } as Message

  it('quem está no chat, eu e os autores, com o apelido do servidor', () => {
    expect(mentionPeople([ana], me, [fromBia, system], { eu: 'Euzinho', bia: 'Bibi' })).toEqual([
      ana,
      { username: 'eu', display_name: 'Eu', nickname: 'Euzinho' },
      { username: 'bia', display_name: 'Bia', nickname: 'Bibi' }
    ])
  })

  it('sem login e sem apelidos (DM)', () => {
    expect(mentionPeople([], null, [fromBia], undefined)).toEqual([
      { username: 'bia', display_name: 'Bia', nickname: undefined }
    ])
  })
})
