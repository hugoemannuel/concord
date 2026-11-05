import type { ConversationSummary } from '../api/conversations'
import type { Message } from '../api/messages'
import { badgeText, MAX_RAIL_DMS, shouldCountUnread, totalUnread, railDmsOf, unreadLabel, unreadRailDms } from './unreadCounts'

const msg = (over: Partial<Message> = {}): Message => ({
  id: 'm1',
  author_id: 'outra',
  content: 'oi',
  created_at: '2026-10-28T10:00:00Z',
  ...over
})

describe('shouldCountUnread', () => {
  it('conta mensagem de outra pessoa num chat que não está aberto', () => {
    expect(shouldCountUnread(msg({ conversation_id: 'd1' }), 'eu', null)).toBe(true)
    expect(shouldCountUnread(msg({ channel_id: 'c1' }), 'eu', { kind: 'conversation', id: 'd1' })).toBe(true)
  })

  it('não conta a minha própria mensagem (nem a enviada de outro aparelho)', () => {
    expect(shouldCountUnread(msg({ author_id: 'eu', conversation_id: 'd1' }), 'eu', null)).toBe(false)
  })

  it('não conta quando o chat da mensagem é o que está aberto', () => {
    expect(shouldCountUnread(msg({ conversation_id: 'd1' }), 'eu', { kind: 'conversation', id: 'd1' })).toBe(false)
    expect(shouldCountUnread(msg({ channel_id: 'c1' }), 'eu', { kind: 'channel', id: 'c1' })).toBe(false)
  })

  it('canal e conversa com o mesmo id não se confundem', () => {
    expect(shouldCountUnread(msg({ channel_id: 'x' }), 'eu', { kind: 'conversation', id: 'x' })).toBe(true)
  })
})

describe('totalUnread', () => {
  it('soma as não lidas das conversas', () => {
    const c = (n: number) => ({ unread_count: n }) as ConversationSummary
    expect(totalUnread([c(2), c(0), c(3)])).toBe(5)
    expect(totalUnread([])).toBe(0)
  })
})

describe('badgeText / unreadLabel', () => {
  it('limita a 99+', () => {
    expect(badgeText(3)).toBe('3')
    expect(badgeText(99)).toBe('99')
    expect(badgeText(120)).toBe('99+')
  })

  it('rótulo para leitor de tela, no singular e no plural', () => {
    expect(unreadLabel(1)).toBe('1 mensagem não lida')
    expect(unreadLabel(5)).toBe('5 mensagens não lidas')
  })
})

describe('unreadRailDms', () => {
  const conv = (id: string, unread: number, at: string) =>
    ({ id, unread_count: unread, updated_at: at, type: 'dm', name: '', members: [], created_at: at }) as ConversationSummary

  it('só as conversas com não lidas, da mensagem mais nova para a mais velha', () => {
    const list = [conv('a', 2, '2026-11-01'), conv('b', 0, '2026-11-04'), conv('c', 1, '2026-11-03')]
    expect(unreadRailDms(list).map((c) => c.id)).toEqual(['c', 'a'])
  })

  it('no máximo MAX_RAIL_DMS (o resto continua no selo das DMs)', () => {
    const list = Array.from({ length: MAX_RAIL_DMS + 2 }, (_, i) => conv(`c${i}`, 1, `2026-11-0${i + 1}`))
    expect(unreadRailDms(list)).toHaveLength(MAX_RAIL_DMS)
  })
})

describe('railDmsOf', () => {
  it('DM mostra a foto da outra pessoa; grupo, o ícone do grupo', () => {
    const at = '2026-11-01'
    const person = { id: 'u2', username: 'ana', display_name: 'Ana', avatar_url: 'a.png' }
    const list = [
      { id: 'd', type: 'dm', name: '', other_user: person, members: [], unread_count: 2, created_at: at, updated_at: '2026-11-02' },
      { id: 'g', type: 'group', name: 'Turma', icon_url: 'g.png', members: [], unread_count: 1, created_at: at, updated_at: at }
    ] as ConversationSummary[]
    expect(railDmsOf(list, 'eu')).toEqual([
      { id: 'd', title: 'Ana', type: 'dm', avatarUrl: 'a.png', unread: 2 },
      { id: 'g', title: 'Turma', type: 'group', avatarUrl: 'g.png', unread: 1 }
    ])
  })
})
