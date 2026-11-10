import { describe, expect, it } from 'vitest'
import type { Message } from '../../chat/api/messages'
import {
  DEFAULT_NOTIFY_SETTINGS,
  isActive,
  isMutedNow,
  mentionKindOf,
  muteDecision,
  resolveScope,
  type NotifySettings,
  type ResolvedScope
} from './notificationMute'

const NOW = Date.parse('2026-10-25T12:00:00Z')

const settings = (over: Partial<NotifySettings> = {}): NotifySettings => ({
  ...DEFAULT_NOTIFY_SETTINGS,
  ...over
})

const msg = (over: Partial<Message> = {}): Message =>
  ({
    id: 'm1',
    author_id: 'ana',
    channel_id: 'c1',
    content: 'oi',
    created_at: '',
    ...over
  }) as Message

const me = { id: 'eu', username: 'eu' }

describe('isMutedNow', () => {
  it('sem preferência ou sem mute não silencia', () => {
    expect(isMutedNow(undefined, NOW)).toBe(false)
    expect(isMutedNow(settings(), NOW)).toBe(false)
  })

  it('até reativar silencia sempre', () => {
    expect(isMutedNow(settings({ muted: true }), NOW)).toBe(true)
  })

  it('respeita o prazo e expira sozinho', () => {
    const until = '2026-10-25T12:15:00Z'
    expect(isMutedNow(settings({ muted: true, muted_until: until }), NOW)).toBe(true)
    expect(isMutedNow(settings({ muted: true, muted_until: until }), NOW + 15 * 60_000)).toBe(false)
  })
})

describe('isActive', () => {
  it('prazo vencido sem outra mudança não está ativo', () => {
    expect(isActive(settings({ muted: true, muted_until: '2026-10-25T11:00:00Z' }), NOW)).toBe(
      false
    )
  })

  it('nível diferente de all ou suprimir @everyone contam', () => {
    expect(isActive(settings({ level: 'mentions' }), NOW)).toBe(true)
    expect(isActive(settings({ suppress_everyone: true }), NOW)).toBe(true)
  })
})

describe('resolveScope', () => {
  it('silenciar o servidor vale para todos os canais', () => {
    expect(resolveScope(settings({ muted: true }), undefined, NOW).muted).toBe(true)
  })

  it('silenciar só o canal vale mesmo com servidor normal', () => {
    expect(resolveScope(settings(), settings({ muted: true }), NOW).muted).toBe(true)
  })

  it('o nível do canal manda; all herda o do servidor', () => {
    expect(resolveScope(settings({ level: 'mentions' }), settings({ level: 'nothing' }), NOW).level).toBe(
      'nothing'
    )
    expect(resolveScope(settings({ level: 'mentions' }), settings(), NOW).level).toBe('mentions')
    expect(resolveScope(undefined, undefined, NOW).level).toBe('all')
  })

  it('suprimir @everyone vem do servidor', () => {
    expect(resolveScope(settings({ suppress_everyone: true }), undefined, NOW).suppressEveryone).toBe(
      true
    )
  })
})

describe('mentionKindOf', () => {
  it('@nick numa encaminhada não é menção (só a original citava)', () => {
    const forwarded_from = { message_id: 'm0', author_id: 'bia', author_name: 'Bia', created_at: '' }
    expect(mentionKindOf(msg({ content: 'oi @eu', forwarded_from }), me).direct).toBe(false)
  })

  it('@nick e resposta são diretas', () => {
    expect(mentionKindOf(msg({ content: 'oi @eu' }), me).direct).toBe(true)
    expect(
      mentionKindOf(msg({ reply_to: { author_id: 'eu' } as Message['reply_to'] }), me).direct
    ).toBe(true)
  })

  it('@all vale e @here não pinga ausente', () => {
    expect(mentionKindOf(msg({ mention_everyone: 'all' }), me).everyone).toBe(true)
    expect(
      mentionKindOf(msg({ mention_everyone: 'here' }), { ...me, status: 'idle' }).everyone
    ).toBe(false)
  })

  it('mensagem minha não me menciona', () => {
    expect(mentionKindOf(msg({ author_id: 'eu', content: '@eu' }), me)).toEqual({
      direct: false,
      everyone: false
    })
  })
})

describe('muteDecision', () => {
  const scope = (over: Partial<ResolvedScope> = {}): ResolvedScope => ({
    muted: false,
    level: 'all',
    suppressEveryone: false,
    ...over
  })
  const none = { direct: false, everyone: false }
  const direct = { direct: true, everyone: false }
  const everyone = { direct: false, everyone: true }

  it('padrão: não lida sempre, aviso só com menção', () => {
    expect(muteDecision(scope(), none)).toEqual({ notify: false, unread: true, mention: false })
    expect(muteDecision(scope(), direct)).toEqual({ notify: true, unread: true, mention: true })
  })

  it('silenciado: sem aviso nem não lida, menção direta ainda vira selo', () => {
    expect(muteDecision(scope({ muted: true }), none)).toEqual({
      notify: false,
      unread: false,
      mention: false
    })
    expect(muteDecision(scope({ muted: true }), direct)).toEqual({
      notify: false,
      unread: false,
      mention: true
    })
  })

  it('só menções: avisa só quem me chamou e não conta não lida', () => {
    expect(muteDecision(scope({ level: 'mentions' }), none)).toEqual({
      notify: false,
      unread: false,
      mention: false
    })
    expect(muteDecision(scope({ level: 'mentions' }), direct).notify).toBe(true)
  })

  it('nada: nem menção direta aparece', () => {
    expect(muteDecision(scope({ level: 'nothing' }), direct)).toEqual({
      notify: false,
      unread: false,
      mention: false
    })
  })

  it('suprimir @everyone corta o @all mas não a menção direta', () => {
    const s = scope({ suppressEveryone: true })
    expect(muteDecision(s, everyone).mention).toBe(false)
    expect(muteDecision(s, everyone).notify).toBe(false)
    expect(muteDecision(s, direct).notify).toBe(true)
  })
})
