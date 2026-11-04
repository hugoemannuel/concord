import { describe, expect, it } from 'vitest'
import type { NotifySettings } from '../../notifications/lib/notificationMute'
import { hidesChannel } from './hideMutedChannels'

const muted: NotifySettings = { muted: true, muted_until: null, level: 'all', suppress_everyone: false }
const input = (extra = {}) => ({ settings: { c: muted }, unreadByRoom: {}, mentionsByRoom: {}, now: 1000, ...extra })

describe('hidesChannel', () => {
  it('silenciado e sem nada novo some', () => {
    expect(hidesChannel('c', input())).toBe(true)
  })
  it('sem silenciar fica', () => {
    expect(hidesChannel('outro', input())).toBe(false)
  })
  it('com não lida ou menção fica', () => {
    expect(hidesChannel('c', input({ unreadByRoom: { 'channel:c': 1 } }))).toBe(false)
    expect(hidesChannel('c', input({ mentionsByRoom: { 'channel:c': 1 } }))).toBe(false)
  })
  it('o canal aberto fica', () => {
    expect(hidesChannel('c', input({ activeChannelId: 'c' }))).toBe(false)
  })
  it('silêncio vencido não conta', () => {
    const expired = { ...muted, muted_until: new Date(500).toISOString() }
    expect(hidesChannel('c', input({ settings: { c: expired } }))).toBe(false)
  })
})
