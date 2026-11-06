import { describe, expect, it } from 'vitest'
import type { MusicItem } from '../api/music'
import { isOutsidePanel, progressPercent, skipView, visibleQueue } from './musicPanel'

const item = (id: string, by = 'u1'): MusicItem => ({
  id,
  video_id: id,
  title: id,
  artist: 'A',
  thumbnail: '',
  duration_ms: 60_000,
  requested_by: { id: by, username: by, display_name: by },
  has_video: false,
  video_ready: false
})

describe('isOutsidePanel', () => {
  const fake = (maestro = false): Element =>
    ({ closest: () => (maestro ? {} : null) }) as unknown as Element
  const panel = (inside: Element | null): HTMLElement =>
    ({ contains: (t: Element) => t === inside }) as unknown as HTMLElement

  it('sem alvo: não fecha', () => {
    expect(isOutsidePanel(null, panel(null))).toBe(false)
  })

  it('dentro do painel: não fecha', () => {
    const target = fake()
    expect(isOutsidePanel(target, panel(target))).toBe(false)
  })

  it('no Maestro: não fecha (ele mesmo alterna)', () => {
    expect(isOutsidePanel(fake(true), panel(null))).toBe(false)
  })

  it('fora (com ou sem painel montado): fecha', () => {
    expect(isOutsidePanel(fake(), panel(null))).toBe(true)
    expect(isOutsidePanel(fake(), null)).toBe(true)
  })
})

describe('progressPercent', () => {
  it('fração tocada, até 100%', () => {
    expect(progressPercent(30, 60_000)).toBe(50)
    expect(progressPercent(90, 60_000)).toBe(100)
  })

  it('duração zero não divide por zero', () => {
    expect(progressPercent(0, 0)).toBe(0)
  })
})

describe('visibleQueue', () => {
  const queue = ['a', 'b', 'c', 'd', 'e'].map((id) => item(id))

  it('mostra só a prévia, ou tudo', () => {
    expect(visibleQueue(queue, false).map((i) => i.id)).toEqual(['a', 'b', 'c'])
    expect(visibleQueue(queue, true)).toBe(queue)
  })
})

describe('skipView', () => {
  const skip = { votes: 1, needed: 3, voters: ['u2'] }

  it('quem pediu a música pula direto', () => {
    expect(skipView(item('x', 'u1'), skip, 'u1')).toEqual({ label: 'Pular', disabled: false })
  })

  it('outra pessoa vota; quem já votou fica travado', () => {
    expect(skipView(item('x', 'u1'), skip, 'u3')).toEqual({
      label: 'Votar para pular · 1/3',
      disabled: false
    })
    expect(skipView(item('x', 'u1'), skip, 'u2')).toEqual({
      label: 'Votar para pular · 1/3',
      disabled: true
    })
  })

  it('sem login não conta como voto', () => {
    expect(skipView(item('x', 'u1'), skip, undefined).disabled).toBe(false)
  })
})
