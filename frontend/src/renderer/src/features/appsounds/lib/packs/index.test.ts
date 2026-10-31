import { describe, expect, it } from 'vitest'
import { peakVolume, SOUNDS, type Note } from '../../../call/lib/sounds'
import { SOUND_EVENTS } from '../events'
import { DEFAULT_PACK_ID, findPack, SOUND_PACKS } from './index'

const end = (notes: Note[]): number => Math.max(...notes.map((n) => n.at + n.duration))
/** Altura onde a nota termina (com glissando, o fim dele). */
const lastPitch = (notes: Note[]): number => {
  const last = notes.reduce((a, b) => (b.at + b.duration >= a.at + a.duration ? b : a))
  return last.slide ?? last.freq
}
const firstPitch = (notes: Note[]): number => notes.reduce((a, b) => (b.at < a.at ? b : a)).freq

describe('SOUND_PACKS', () => {
  it('o padrão é o Salinha, com os sons de sempre', () => {
    const salinha = findPack(DEFAULT_PACK_ID)
    expect(salinha.label).toBe('Padrão Salinha')
    for (const event of SOUND_EVENTS) expect(salinha.sounds[event]).toBe(SOUNDS[event])
  })

  it('tem o padrão e mais 6 estilos, sem repetir id nem nome', () => {
    expect(SOUND_PACKS.length).toBe(7)
    expect(new Set(SOUND_PACKS.map((p) => p.id)).size).toBe(7)
    expect(new Set(SOUND_PACKS.map((p) => p.label)).size).toBe(7)
  })

  it('id no formato que o servidor aceita', () => {
    for (const pack of SOUND_PACKS) expect(pack.id).toMatch(/^[a-z0-9-]{1,32}$/)
  })

  it('todo pacote tem som para todo evento', () => {
    for (const pack of SOUND_PACKS) {
      for (const event of SOUND_EVENTS) expect(pack.sounds[event]?.length, `${pack.id}.${event}`).toBeGreaterThan(0)
    }
  })

  it('todo som é curto (menos de 1,5 s) e não estoura (pico até 0,45)', () => {
    for (const pack of SOUND_PACKS) {
      for (const event of SOUND_EVENTS) {
        const notes = pack.sounds[event]
        expect(end(notes), `${pack.id}.${event}`).toBeLessThan(1.5)
        expect(peakVolume(notes), `${pack.id}.${event}`).toBeLessThanOrEqual(0.45)
      }
    }
  })

  it('em todo pacote, entrar sobe e sair desce', () => {
    const pairs = [
      ['join', 'leave'],
      ['userJoin', 'userLeave'],
      ['unmute', 'mute'],
      ['undeafen', 'deafen']
    ] as const
    for (const pack of SOUND_PACKS) {
      for (const [up, down] of pairs) {
        expect(lastPitch(pack.sounds[up]), `${pack.id}.${up}`).toBeGreaterThan(firstPitch(pack.sounds[up]))
        expect(lastPitch(pack.sounds[down]), `${pack.id}.${down}`).toBeLessThan(firstPitch(pack.sounds[down]))
      }
    }
  })

  it('os estilos soam diferentes entre si (nenhum som igual ao de outro pacote)', () => {
    for (const event of SOUND_EVENTS) {
      const sigs = SOUND_PACKS.map((p) => JSON.stringify(p.sounds[event]))
      expect(new Set(sigs).size, event).toBe(SOUND_PACKS.length)
    }
  })
})

describe('findPack', () => {
  it('id desconhecido (pacote que saiu ou de versão nova) cai no padrão', () => {
    expect(findPack('nao-existe').id).toBe(DEFAULT_PACK_ID)
    expect(findPack('cristal').id).toBe('cristal')
  })
})
