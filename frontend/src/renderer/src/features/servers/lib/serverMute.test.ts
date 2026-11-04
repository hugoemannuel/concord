import { describe, expect, it } from 'vitest'
import { DEFAULT_NOTIFY_SETTINGS } from '../../notifications/lib/notificationMute'
import { mutedSettings, serverMuteChoice, unmutedSettings } from './serverMute'

const NOW = Date.parse('2026-01-01T12:00:00Z')

describe('serverMuteChoice', () => {
  it('servidor normal oferece as durações', () => {
    const choice = serverMuteChoice(undefined, NOW)
    expect(choice.kind).toBe('durations')
    if (choice.kind === 'durations') {
      expect(choice.options.map((o) => o.label)).toContain('Até eu reativar')
    }
  })

  it('silenciado oferece reativar', () => {
    const muted = { ...DEFAULT_NOTIFY_SETTINGS, muted: true, muted_until: null }
    expect(serverMuteChoice(muted, NOW)).toEqual({ kind: 'unmute' })
  })

  it('prazo vencido conta como reativado: volta a oferecer silenciar', () => {
    const expired = {
      ...DEFAULT_NOTIFY_SETTINGS,
      muted: true,
      muted_until: new Date(NOW - 1000).toISOString()
    }
    expect(serverMuteChoice(expired, NOW).kind).toBe('durations')
  })
})

describe('mutedSettings / unmutedSettings', () => {
  it('silencia por 1 hora sem perder o nível', () => {
    const next = mutedSettings({ ...DEFAULT_NOTIFY_SETTINGS, level: 'mentions' }, 3_600_000, NOW)
    expect(next.muted).toBe(true)
    expect(next.level).toBe('mentions')
    expect(next.muted_until).toBe(new Date(NOW + 3_600_000).toISOString())
  })

  it('"até eu reativar" não tem prazo', () => {
    expect(mutedSettings(DEFAULT_NOTIFY_SETTINGS, null, NOW).muted_until).toBeNull()
  })

  it('reativar limpa o silêncio e o prazo', () => {
    const next = unmutedSettings({ ...DEFAULT_NOTIFY_SETTINGS, muted: true, muted_until: 'x' })
    expect(next).toMatchObject({ muted: false, muted_until: null })
  })
})
