import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// O chip de menção puxa o chatStore inteiro (e o áudio da call).
vi.mock('../../chat/components/MentionChip', () => ({ default: () => null }))

// O SSR do zustand lê o estado inicial: o store vira um objeto simples.
const state = vi.hoisted(() => ({ loaded: false, byId: {} as Record<string, unknown> }))
vi.mock('../store/emojiStore', () => ({
  useEmojiStore: <T,>(select: (s: typeof state) => T): T => select(state)
}))
vi.mock('../hooks/useCustomEmojis', () => ({ useCustomEmojis: () => {} }))
const origins = vi.hoisted(() => ({ emoji: {} as Record<string, unknown>, sticker: {} }))
vi.mock('../store/expressionOrigins', () => ({
  useExpressionOrigins: <T,>(select: (s: typeof origins) => T): T => select(origins),
  requestOrigin: () => {}
}))

import CustomEmoji from './CustomEmoji'
import ReactionEmoji, { ReactionOrigin } from './ReactionEmoji'
import MessageText from '../../chat/components/MessageText'
import { clearEmojiSrcs, primeEmojiSrc } from '../store/emojiSrc'
import type { CustomEmoji as Emoji } from '../api/emojis'

const ID = '3f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b'
const festa: Emoji = {
  id: ID,
  server_id: 's1',
  uploader_id: 'ana',
  name: 'festa',
  content_type: 'image/png',
  size_bytes: 10,
  created_at: ''
}

function loadWith(emojis: Emoji[]): void {
  state.loaded = true
  state.byId = Object.fromEntries(emojis.map((e) => [e.id, e]))
}

describe('CustomEmoji', () => {
  beforeEach(() => {
    state.loaded = false
    state.byId = {}
    clearEmojiSrcs()
    origins.emoji = {}
  })

  it('membro vê a imagem com tamanho fixo, lazy e o :nome: como texto alternativo', () => {
    loadWith([festa])
    primeEmojiSrc(ID, 'https://x/emojis/a/file?token=t')
    const html = renderToStaticMarkup(<CustomEmoji id={ID} name="festa" />)
    expect(html).toContain('src="https://x/emojis/a/file?token=t"')
    expect(html).toContain('alt=":festa:"')
    expect(html).toContain('width="22"')
    expect(html).toContain('loading="lazy"')
  })

  describe('de um servidor que não é da pessoa', () => {
    const origin = { server_name: 'Alfa' }

    it('enquanto o servidor não responde, guarda o espaço', () => {
      loadWith([])
      expect(renderToStaticMarkup(<CustomEmoji id={ID} name="festa" />)).toContain('role="img"')
    })

    it('sem acesso vê :nome:', () => {
      loadWith([])
      origins.emoji = { [ID]: null }
      expect(renderToStaticMarkup(<CustomEmoji id={ID} name="festa" />)).toBe(':festa:')
    })

    it('apagado na origem vê :nome:, não a imagem quebrada', () => {
      loadWith([])
      primeEmojiSrc(ID, 'u')
      origins.emoji = { [ID]: { id: ID, name: 'festa', deleted: true } }
      expect(renderToStaticMarkup(<CustomEmoji id={ID} name="festa" />)).toBe(':festa:')
    })

    it('já usado fora do servidor vê a imagem, como quem é membro', () => {
      loadWith([])
      primeEmojiSrc(ID, 'u')
      origins.emoji = { [ID]: { id: ID, name: 'festa', origin } }
      expect(renderToStaticMarkup(<CustomEmoji id={ID} name="festa" />)).toContain('src="u"')
    })

    it('na reação, o nome vem do servidor (a reação só guarda o id)', () => {
      loadWith([])
      origins.emoji = { [ID]: { id: ID, name: 'festa', deleted: true } }
      expect(renderToStaticMarkup(<ReactionEmoji emoji={`<:${ID}>`} />)).toBe(':festa:')
    })

    it('no texto da mensagem, dá para clicar para ver de onde veio', () => {
      loadWith([])
      primeEmojiSrc(ID, 'u')
      origins.emoji = { [ID]: { id: ID, name: 'festa', origin } }
      const html = renderToStaticMarkup(<MessageText content={`<:festa:${ID}>`} everyone={null} />)
      expect(html).toContain('aria-haspopup="dialog"')
    })

    it('apagado no texto da mensagem é só texto, sem clique', () => {
      loadWith([])
      origins.emoji = { [ID]: { id: ID, name: 'festa', deleted: true } }
      const html = renderToStaticMarkup(<MessageText content={`<:festa:${ID}>`} everyone={null} />)
      expect(html).toContain(':festa:')
      expect(html).not.toContain('aria-haspopup')
    })
  })

  it('antes de carregar guarda o espaço sem mostrar o token', () => {
    const html = renderToStaticMarkup(<CustomEmoji id={ID} name="festa" size="jumbo" />)
    expect(html).toContain('role="img"')
    expect(html).toContain('h-12 w-12')
  })

  it('reação personalizada vira imagem de 20px; reação comum continua texto', () => {
    loadWith([festa])
    primeEmojiSrc(ID, 'u')
    expect(renderToStaticMarkup(<ReactionEmoji emoji={`<:${ID}>`} />)).toContain('width="20"')
    expect(renderToStaticMarkup(<ReactionEmoji emoji="🔥" />)).toBe('🔥')
  })

  it('mensagem só com emoji mostra grande; com texto, do tamanho da linha', () => {
    loadWith([festa])
    primeEmojiSrc(ID, 'u')
    const only = renderToStaticMarkup(<MessageText content={`<:festa:${ID}>`} everyone={null} />)
    expect(only).toContain('width="48"')
    const mixed = renderToStaticMarkup(<MessageText content={`oi <:festa:${ID}>`} everyone={null} />)
    expect(mixed).toContain('width="22"')
    expect(mixed).toContain('oi ')
  })
})

describe('ReactionOrigin', () => {
  beforeEach(() => {
    origins.emoji = {}
  })

  it('diz de que servidor veio; privado não tem nome', () => {
    origins.emoji = { [ID]: { id: ID, name: 'festa', origin: { server_name: 'Alfa' } } }
    expect(renderToStaticMarkup(<ReactionOrigin emoji={`<:${ID}>`} />)).toContain('de Alfa')
    origins.emoji = { [ID]: { id: ID, name: 'festa', origin: { private: true } } }
    expect(renderToStaticMarkup(<ReactionOrigin emoji={`<:${ID}>`} />)).toContain('de um servidor privado')
  })

  it('emoji comum ou apagado não tem origem', () => {
    expect(renderToStaticMarkup(<ReactionOrigin emoji="🔥" />)).toBe('')
    origins.emoji = { [ID]: { id: ID, name: 'festa', deleted: true } }
    expect(renderToStaticMarkup(<ReactionOrigin emoji={`<:${ID}>`} />)).toBe('')
  })
})
