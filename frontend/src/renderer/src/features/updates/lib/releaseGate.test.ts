import { describe, expect, it } from 'vitest'
import type { ChangelogRelease } from '../api/changelog'
import { currentVersionOf, gateView, seenToWrite } from './releaseGate'

const releases: ChangelogRelease[] = [
  {
    version: '1.2.0',
    released_at: '',
    summary: '',
    required: true,
    entries: [{ kind: 'feature', text: 'Nova', highlight: true }]
  },
  { version: '1.1.0', released_at: '', summary: '', entries: [] }
]
const base = { loaded: true, installed: '1.2.0', minVersion: '1.2.0', releases }

describe('gateView', () => {
  it('ainda carregando: nada', () => {
    expect(gateView({ ...base, loaded: false }, '1.1.0')).toEqual({ kind: 'none', current: null })
  })

  it('abaixo da mínima: o obrigatório, mesmo com novidades', () => {
    expect(gateView({ ...base, installed: '1.1.0' }, '1.0.0')).toEqual({
      kind: 'required',
      installed: '1.1.0',
      minVersion: '1.2.0'
    })
  })

  it('atualizou e há destaques: novidades', () => {
    expect(gateView(base, '1.1.0')).toEqual({
      kind: 'whatsNew',
      current: '1.2.0',
      groups: [{ version: '1.2.0', features: ['Nova'], fixes: [] }]
    })
  })

  it('sem destaques novos (ou primeira vez): nada, com a versão atual para gravar como vista', () => {
    expect(gateView(base, '1.2.0')).toEqual({ kind: 'none', current: '1.2.0' })
    expect(gateView(base, null)).toEqual({ kind: 'none', current: '1.2.0' })
  })

  it('na web: a atual é a mais nova publicada e nunca bloqueia', () => {
    expect(gateView({ ...base, installed: null }, '1.1.0')).toMatchObject({
      kind: 'whatsNew',
      current: '1.2.0'
    })
  })
})

describe('currentVersionOf', () => {
  it('a instalada no desktop, a mais nova publicada na web', () => {
    expect(currentVersionOf({ installed: '1.0.0', releases })).toBe('1.0.0')
    expect(currentVersionOf({ installed: null, releases })).toBe('1.2.0')
    expect(currentVersionOf({ installed: null, releases: [] })).toBeNull()
  })
})

describe('seenToWrite', () => {
  it('sem modal e versão atual diferente da vista: grava a atual', () => {
    expect(seenToWrite({ kind: 'none', current: '1.2.0' }, null)).toBe('1.2.0')
    expect(seenToWrite({ kind: 'none', current: '1.2.0' }, '1.1.0')).toBe('1.2.0')
  })

  it('já gravada, sem versão conhecida ou com modal aberto: nada', () => {
    expect(seenToWrite({ kind: 'none', current: '1.2.0' }, '1.2.0')).toBeNull()
    expect(seenToWrite({ kind: 'none', current: null }, null)).toBeNull()
    expect(seenToWrite({ kind: 'whatsNew', current: '1.2.0', groups: [] }, '1.1.0')).toBeNull()
    expect(
      seenToWrite({ kind: 'required', installed: '1.0.0', minVersion: '1.2.0' }, null)
    ).toBeNull()
  })
})
