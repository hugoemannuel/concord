import { describe, expect, it } from 'vitest'
import { applyRailMove, railMoveEntries } from './railMoveMenu'
import type { RailLayoutItem } from './serverRailLayout'

const items: RailLayoutItem[] = [
  { kind: 'folder', id: 'f1', name: 'Jogos', server_ids: ['s1', 's2'] },
  { kind: 'folder', id: 'f2', name: 'Estudo', server_ids: ['s5'] },
  { kind: 'server', server_id: 's3' },
  { kind: 'server', server_id: 's4' }
]

describe('railMoveEntries', () => {
  it('servidor solto no meio: criar pasta, cada pasta, subir e descer', () => {
    expect(railMoveEntries(items, 's3')).toEqual([
      { kind: 'new-folder' },
      { kind: 'to-folder', folderId: 'f1', name: 'Jogos' },
      { kind: 'to-folder', folderId: 'f2', name: 'Estudo' },
      { kind: 'up' },
      { kind: 'down' }
    ])
  })

  it('o último não desce', () => {
    expect(railMoveEntries(items, 's4').map((e) => e.kind)).not.toContain('down')
  })

  it('servidor numa pasta: tirar da pasta, sem a própria pasta na lista', () => {
    const entries = railMoveEntries(items, 's1')
    expect(entries).toContainEqual({ kind: 'out-of-folder' })
    expect(entries).toContainEqual({ kind: 'to-folder', folderId: 'f2', name: 'Estudo' })
    expect(entries).not.toContainEqual({ kind: 'to-folder', folderId: 'f1', name: 'Jogos' })
    // primeiro da pasta não sobe, mas desce
    expect(entries.map((e) => e.kind)).not.toContain('up')
    expect(entries.map((e) => e.kind)).toContain('down')
  })

  it('sem pastas, só criar pasta e mover', () => {
    const plain: RailLayoutItem[] = [
      { kind: 'server', server_id: 'a' },
      { kind: 'server', server_id: 'b' }
    ]
    expect(railMoveEntries(plain, 'a')).toEqual([{ kind: 'new-folder' }, { kind: 'down' }])
  })
})

describe('applyRailMove', () => {
  it('criar pasta não muda o trilho (abre o diálogo)', () => {
    expect(applyRailMove(items, 's3', { kind: 'new-folder' })).toBeNull()
  })

  it('mover para a pasta coloca o servidor nela', () => {
    const next = applyRailMove(items, 's3', { kind: 'to-folder', folderId: 'f2', name: 'Estudo' })
    expect(next?.find((i) => i.kind === 'folder' && i.id === 'f2')).toMatchObject({
      server_ids: ['s5', 's3']
    })
  })

  it('tirar da pasta põe o servidor logo depois dela', () => {
    const next = applyRailMove(items, 's2', { kind: 'out-of-folder' })
    expect(next?.map((i) => (i.kind === 'server' ? i.server_id : i.id))).toEqual([
      'f1',
      's2',
      'f2',
      's3',
      's4'
    ])
  })

  it('descer troca com o vizinho', () => {
    const next = applyRailMove(items, 's3', { kind: 'down' })
    expect(next?.map((i) => (i.kind === 'server' ? i.server_id : i.id))).toEqual([
      'f1',
      'f2',
      's4',
      's3'
    ])
  })
})
