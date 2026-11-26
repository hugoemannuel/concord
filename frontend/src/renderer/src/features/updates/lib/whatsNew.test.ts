import { describe, expect, it } from 'vitest'
import type { ChangelogEntry, ChangelogRelease } from '../api/changelog'
import { whatsNewSince } from './whatsNew'

const feat = (text: string, highlight = true): ChangelogEntry => ({
  kind: 'feature',
  text,
  highlight
})
const fix = (text: string, highlight = true): ChangelogEntry => ({ kind: 'fix', text, highlight })
const rel = (version: string, entries: ChangelogEntry[]): ChangelogRelease => ({
  version,
  released_at: '2026-11-24T12:00:00Z',
  summary: '',
  entries
})

const releases = [
  rel('1.3.0', [feat('Depois da atual')]),
  rel('1.2.0', [feat('Destaque nova'), feat('Sem destaque', false), fix('Correção em destaque')]),
  rel('1.1.10', [feat('Pulada')]),
  rel('1.1.9', [feat('Já vista')])
]

describe('whatsNewSince', () => {
  it('junta os destaques das versões depois da vista até a atual, da mais nova para a mais antiga', () => {
    expect(whatsNewSince(releases, '1.1.9', '1.2.0')).toEqual([
      { version: '1.2.0', features: ['Destaque nova'], fixes: ['Correção em destaque'] },
      { version: '1.1.10', features: ['Pulada'], fixes: [] }
    ])
  })

  it('primeira vez (nada visto) não mostra o histórico', () => {
    expect(whatsNewSince(releases, null, '1.2.0')).toEqual([])
  })

  it('sem versão atual conhecida, nada', () => {
    expect(whatsNewSince(releases, '1.1.9', null)).toEqual([])
  })

  it('versões sem destaque ficam de fora', () => {
    expect(whatsNewSince([rel('2.0.0', [feat('x', false)])], '1.0.0', '2.0.0')).toEqual([])
  })

  it('já viu a atual (ou voltou de versão): nada', () => {
    expect(whatsNewSince(releases, '1.2.0', '1.2.0')).toEqual([])
    expect(whatsNewSince(releases, '1.3.0', '1.2.0')).toEqual([])
  })
})
