import { describe, expect, it } from 'vitest'
import { SOUNDS } from '../../call/lib/sounds'
import {
  choiceFor,
  customSoundSrc,
  DEFAULT_APP_SOUNDS,
  normalizeAppSounds,
  resolveSound,
  withChoice,
  type AppSoundSettings
} from './choice'
import { packSound } from './packs'

const FILE = '/api/app-sounds/8f14e45f-ceea-4e7a-9f6b-1f3a2b4c5d6e'
const settings = (over: Partial<AppSoundSettings> = {}): AppSoundSettings => ({
  ...DEFAULT_APP_SOUNDS,
  ...over
})

describe('resolveSound', () => {
  it('sem nada escolhido: os sons de sempre, no volume de sempre', () => {
    expect(resolveSound('mention', settings(), {}, '/api')).toEqual({
      kind: 'notes',
      notes: SOUNDS.mention,
      gain: 1
    })
  })

  it('o pacote vale para todos os eventos; o volume vira ganho', () => {
    const r = resolveSound('mute', settings({ pack: 'cristal', volume: 150 }), {}, '/api')
    expect(r).toEqual({ kind: 'notes', notes: packSound('cristal', 'mute'), gain: 1.5 })
  })

  it('o ajuste do evento vence o pacote', () => {
    const s = settings({ pack: 'cristal', events: { mute: 'bolhas' } })
    expect(resolveSound('mute', s, {}, '/api')).toMatchObject({ notes: packSound('bolhas', 'mute') })
  })

  it('"Sem som" e volume zero silenciam', () => {
    expect(resolveSound('mute', settings({ events: { mute: 'off' } }), {}, '/api')).toEqual({ kind: 'off' })
    expect(resolveSound('mute', settings({ volume: 0 }), {}, '/api')).toEqual({ kind: 'off' })
  })

  it('áudio próprio toca o arquivo, com o som do pacote de reserva', () => {
    const s = settings({ pack: 'marimba', events: { knock: 'custom' } })
    expect(resolveSound('knock', s, { knock: FILE }, 'http://host:8080/api')).toEqual({
      kind: 'file',
      src: `http://host:8080${FILE}`,
      gain: 1,
      fallback: packSound('marimba', 'knock')
    })
  })

  it('"custom" sem arquivo (apagado em outro aparelho) cai no pacote', () => {
    const s = settings({ pack: 'marimba', events: { knock: 'custom' } })
    expect(resolveSound('knock', s, {}, '/api')).toMatchObject({ kind: 'notes', notes: packSound('marimba', 'knock') })
  })
})

describe('customSoundSrc', () => {
  it('só aceita o caminho que o servidor grava', () => {
    expect(customSoundSrc(FILE, '/api')).toBe(FILE)
    expect(customSoundSrc('https://outro.site/x.mp3', '/api')).toBeNull()
    expect(customSoundSrc('/api/app-sounds/../segredo', '/api')).toBeNull()
    expect(customSoundSrc(undefined, '/api')).toBeNull()
  })
})

describe('choiceFor e withChoice', () => {
  it('sem ajuste o evento segue o pacote; escolher "pack" tira o ajuste', () => {
    const s = settings()
    expect(choiceFor('mute', s)).toBe('pack')
    const set = withChoice(s, 'mute', 'off')
    expect(choiceFor('mute', set)).toBe('off')
    expect(set).not.toBe(s)
    expect(withChoice(set, 'mute', 'pack').events).toEqual({})
  })
})

describe('normalizeAppSounds', () => {
  it('limpa o que veio do servidor: evento desconhecido sai, volume fica entre 0 e 200', () => {
    expect(
      normalizeAppSounds({
        pack: 'bolhas',
        volume: 999,
        events: { mute: 'off', levelChime: 'off' },
        custom: { knock: FILE, nada: FILE }
      })
    ).toEqual({
      settings: { pack: 'bolhas', volume: 200, events: { mute: 'off' } },
      custom: { knock: FILE }
    })
  })

  it('resposta vazia ou quebrada vira o padrão', () => {
    expect(normalizeAppSounds({})).toEqual({ settings: DEFAULT_APP_SOUNDS, custom: {} })
    expect(normalizeAppSounds({ volume: -5, pack: 3 }).settings).toMatchObject({ volume: 0, pack: 'salinha' })
  })
})
