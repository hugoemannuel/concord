import { describe, expect, it } from 'vitest'
import type { SoundboardItem } from '../api/soundboard'
import { editServerSounds, prependSound, replaceSound, withoutSound } from './serverSoundList'

const sound = (id: string, name = id): SoundboardItem => ({
  id,
  server_id: 's1',
  uploader_id: 'u1',
  uploader_name: 'Ana',
  name,
  content_type: 'audio/ogg',
  size_bytes: 1,
  duration_ms: 1000,
  created_at: '2026-11-01T00:00:00Z'
})

describe('lista de sons de um servidor', () => {
  it('novo vai para o topo, sem repetir', () => {
    const list = [sound('a')]
    expect(prependSound(sound('b'))(list).map((x) => x.id)).toEqual(['b', 'a'])
    expect(prependSound(sound('a'))(list)).toBe(list)
  })

  it('editado troca no lugar; apagado sai', () => {
    const list = [sound('a'), sound('b')]
    expect(replaceSound(sound('b', 'Buzina'))(list).map((x) => x.name)).toEqual(['a', 'Buzina'])
    expect(withoutSound('a')(list).map((x) => x.id)).toEqual(['b'])
  })

  it('só mexe no servidor pedido (e cria a lista se não havia)', () => {
    const other = [sound('z')]
    const next = editServerSounds({ s2: other }, 's1', prependSound(sound('a')))
    expect(next.s2).toBe(other)
    expect(next.s1.map((x) => x.id)).toEqual(['a'])
  })
})
