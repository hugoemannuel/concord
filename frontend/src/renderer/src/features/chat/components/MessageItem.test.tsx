import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// SSR lê o estado atual do zustand (mesmo truque do ImageContextMenu.test).
vi.spyOn(React, 'useSyncExternalStore').mockImplementation((_subscribe, getSnapshot) =>
  getSnapshot()
)

// O player de música puxa o áudio da chamada (AudioWorklet), que não existe no Node.
vi.mock('../../music/components/MusicMessage', () => ({
  default: () => <div data-music="" />
}))
vi.mock('../../call/lib/noiseSuppression', () => ({ openMicrophone: vi.fn() }))
vi.mock('../../call/lib/rtc', () => ({}))
vi.mock('../../../app/router', () => ({
  default: { navigate: vi.fn(), state: { location: { pathname: '/' } } }
}))

import type { Message } from '../api/messages'
import { useAuthStore } from '../../auth/store/authStore'
import { useFriendStore } from '../../friends/store/friendStore'
import { useChatStore } from '../store/chatStore'
import MessageItem, { type MessageItemProps } from './MessageItem'

const noop = (): void => {}
const asyncNoop = async (): Promise<void> => {}

function msg(over: Partial<Message> = {}): Message {
  return {
    id: 'm1',
    author_id: 'bia',
    author: { username: 'bia', display_name: 'Bia' } as Message['author'],
    content: 'olá pessoal',
    created_at: '2026-01-01T10:00:00Z',
    ...over
  }
}

function render(message: Message, over: Partial<MessageItemProps> = {}): string {
  return renderToStaticMarkup(
    <MessageItem
      message={message}
      isHighlighted={false}
      onReply={noop}
      onReact={noop}
      onJumpToMessage={noop}
      onDelete={noop}
      onVote={asyncNoop}
      onEndPoll={asyncNoop}
      onCopy={noop}
      onStartEdit={noop}
      onSaveEdit={noop}
      onCancelEdit={noop}
      isEditing={false}
      savingEdit={false}
      canReact
      canModerate={false}
      {...over}
    />
  )
}

describe('MessageItem', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: { id: 'ana', username: 'ana', display_name: 'Ana' } as never })
    useFriendStore.setState({ blocked: [] })
  })

  it('linha comum: avatar, nome, hora e texto', () => {
    const html = render(msg())
    expect(html).toContain('id="msg-m1"')
    expect(html).toContain('Perfil de Bia')
    expect(html).toContain('olá pessoal')
    expect(html).toContain('py-1.5')
  })

  it('agrupada: sem avatar, só os selos (editada, fixada)', () => {
    const html = render(
      msg({ edited_at: '2026-01-01T10:05:00Z', pinned_at: '2026-01-01T10:06:00Z' }),
      { grouped: true }
    )
    expect(html).not.toContain('Perfil de Bia')
    expect(html).toContain('(editada)')
    expect(html).toContain('fixada')
    expect(html).toContain('py-0.5')
  })

  it('encaminhada: o selo com a origem e o texto da original', () => {
    const html = render(
      msg({
        content: 'olha isso',
        forwarded_from: {
          message_id: 'm0',
          author_id: 'caio',
          author_name: 'Caio',
          channel_id: 'c1',
          channel_name: 'geral',
          server_name: 'Salinha',
          created_at: '2026-01-01T09:00:00Z'
        }
      })
    )
    expect(html).toContain('Encaminhada')
    expect(html).toContain('de Caio · #geral · Salinha')
    expect(html).toContain('olha isso')
    expect(render(msg())).not.toContain('Encaminhada')
  })

  it('mensagem /tts leva o selo de alto-falante', () => {
    expect(render(msg({ tts: true }))).toContain('Mensagem TTS')
    expect(render(msg())).not.toContain('Mensagem TTS')
    expect(render(msg({ tts: true }), { grouped: true })).toContain('Mensagem TTS')
  })

  it('resposta a uma mensagem apagada mostra o aviso da original', () => {
    expect(render(msg({ reply_to_id: 'x' }))).toContain('Mensagem original foi excluída')
  })

  it('resposta a mensagem com imagem mostra avatar, nome e Imagem com ícone (nunca enquete)', () => {
    useChatStore.setState({
      messagesByRoom: {
        'channel:c1': [
          {
            id: 'orig1',
            author_id: 'jamal',
            author: { id: 'jamal', username: 'jamal', display_name: 'Jamal', avatar_url: 'https://example.com/jamal.png' },
            content: '',
            attachments: [{ id: 'a1', kind: 'image', filename: 'foto.png', content_type: 'image/png', size_bytes: 1000 }],
            created_at: '2026-01-01T09:00:00Z'
          }
        ]
      }
    })
    const html = render(
      msg({
        channel_id: 'c1',
        reply_to_id: 'orig1',
        reply_to: { id: 'orig1', author_id: 'jamal', content: '' }
      })
    )
    expect(html).toContain('@Jamal')
    expect(html).toContain('https://example.com/jamal.png')
    expect(html).not.toContain('🖼')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"(?:(?!<\/svg>).)*<\/svg><span[^>]*>Imagem<\/span>/)
    expect(html).not.toContain('Enquete')
  })

  it('resposta a mensagem só com imagem sem cache usa Imagem com ícone como fallback', () => {
    useChatStore.setState({ messagesByRoom: {} })
    const html = render(
      msg({
        channel_id: 'c1',
        reply_to_id: 'orig2',
        reply_to: {
          id: 'orig2',
          author_id: 'jamal',
          author: { id: 'jamal', username: 'jamal', display_name: 'Jamal' },
          content: ''
        }
      })
    )
    expect(html).toContain('@Jamal')
    expect(html).not.toContain('🖼')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"(?:(?!<\/svg>).)*<\/svg><span[^>]*>Imagem<\/span>/)
    expect(html).not.toContain('Enquete')
  })

  it('reações viram chips com a contagem', () => {
    const html = render(msg({ reactions: [{ emoji: '🔥', count: 3, user_ids: ['a', 'b', 'c'] }] }))
    expect(html).toContain('🔥')
    expect(html).toContain('>3<')
  })

  it('figurinha que não veio mostra "Figurinha indisponível"', () => {
    expect(render(msg({ content: '', sticker_id: 's1' }))).toContain('Figurinha indisponível')
  })

  it('autor bloqueado: a mensagem fica escondida', () => {
    useFriendStore.setState({ blocked: [{ id: 'bia' } as never] })
    const html = render(msg())
    expect(html).toContain('1 mensagem bloqueada')
    expect(html).not.toContain('olá pessoal')
  })

  it('mensagem de sistema não vira linha de autor', () => {
    const html = render(msg({ system_kind: 'birthday', content: 'Feliz aniversário' }))
    expect(html).not.toContain('Perfil de Bia')
    expect(html).toContain('Feliz aniversário')
  })

  it('aviso temporário vai para a linha centralizada, sem o selo de sistema', () => {
    const html = render(
      msg({ system_kind: 'disappearing', content: 'Mensagens temporárias ativadas: 24 horas' })
    )
    expect(html).toContain('Mensagens temporárias ativadas: 24 horas')
    expect(html).not.toContain('Servidor')
    expect(html).toContain('role="note"')
  })

  it('mensagem da música vai para o card de música', () => {
    expect(render(msg({ system_kind: 'music' }))).toContain('data-music')
  })

  it('a lista de comandos fixada no #musica também vai para o card do Maestro', () => {
    expect(render(msg({ system_kind: 'music_commands' }))).toContain('data-music')
  })

  it('em edição mostra o editor no lugar do texto', () => {
    const html = render(msg({ author_id: 'ana' }), { isEditing: true })
    expect(html).toContain('<textarea')
  })
})
