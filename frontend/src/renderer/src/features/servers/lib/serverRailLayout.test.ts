import { describe, expect, it } from 'vitest'
import type { Server } from '../api/servers'
import {
  DEFAULT_FOLDER_NAME,
  addServerToFolder,
  findServerFolder,
  folderRailView,
  groupServersIntoFolder,
  moveFolderServer,
  moveTopLevelItem,
  normalizeFolderName,
  placeServerAtTopLevel,
  reconcileRailLayout,
  renameFolder,
  resolveRailEntries,
  ungroupFolder,
  type RailLayoutItem
} from './serverRailLayout'

const SERVERS: Server[] = [
  { id: 's1', name: 'Alpha', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's2', name: 'Beta', icon_url: 'b.png', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's3', name: 'Gamma', owner_id: 'u1', created_at: '', updated_at: '' },
  { id: 's4', name: 'Delta', owner_id: 'u1', created_at: '', updated_at: '' }
]

describe('normalizeFolderName', () => {
  it('usa o nome padrão quando vazio e corta em 40 caracteres', () => {
    expect(normalizeFolderName('   ')).toBe(DEFAULT_FOLDER_NAME)
    expect(normalizeFolderName('  Jogos  ')).toBe('Jogos')
    expect(normalizeFolderName('a'.repeat(60))).toHaveLength(40)
  })
})

describe('reconcileRailLayout & resolveRailEntries', () => {
  it('sem layout salvo devolve todos os servidores avulsos na ordem original', () => {
    const reconciled = reconcileRailLayout([], SERVERS)
    expect(reconciled).toEqual([
      { kind: 'server', server_id: 's1' },
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's3' },
      { kind: 'server', server_id: 's4' }
    ])
  })

  it('remove servidores inexistentes, deduplica, desfaz pastas vazias e anexa novos no fim', () => {
    const items: RailLayoutItem[] = [
      { kind: 'folder', id: 'f1', name: '  ', server_ids: ['s3', 's99', 's3'] },
      { kind: 'folder', id: 'f-empty', name: 'Vazia', server_ids: ['s88'] },
      { kind: 'server', server_id: 's3' },
      { kind: 'server', server_id: 's1' }
    ]
    const entries = resolveRailEntries(items, SERVERS)
    expect(entries).toEqual([
      { kind: 'folder', id: 'f1', name: DEFAULT_FOLDER_NAME, servers: [SERVERS[2]] },
      { kind: 'server', server: SERVERS[0] },
      { kind: 'server', server: SERVERS[1] },
      { kind: 'server', server: SERVERS[3] }
    ])
  })
})

describe('operações de ordenação e pastas', () => {
  const base: RailLayoutItem[] = [
    { kind: 'server', server_id: 's1' },
    { kind: 'server', server_id: 's2' },
    { kind: 'server', server_id: 's3' },
    { kind: 'server', server_id: 's4' }
  ]

  it('moveTopLevelItem reordena itens do topo', () => {
    const moved = moveTopLevelItem(base, 0, 2)
    expect(moved.map((i) => (i.kind === 'server' ? i.server_id : i.id))).toEqual([
      's2',
      's3',
      's1',
      's4'
    ])
  })

  it('groupServersIntoFolder cria pasta no lugar do servidor alvo com os dois servidores', () => {
    const grouped = groupServersIntoFolder(base, 's2', 's4', 'f1', 'Amigos')
    expect(grouped).toEqual([
      { kind: 'server', server_id: 's1' },
      { kind: 'folder', id: 'f1', name: 'Amigos', server_ids: ['s2', 's4'] },
      { kind: 'server', server_id: 's3' }
    ])
    expect(findServerFolder(grouped, 's4')?.id).toBe('f1')
    expect(findServerFolder(grouped, 's1')).toBeNull()
  })

  it('addServerToFolder move servidor avulso ou de outra pasta para a pasta', () => {
    const withFolder = groupServersIntoFolder(base, 's1', 's2', 'f1', 'Grupo 1')
    const added = addServerToFolder(withFolder, 'f1', 's4', 1)
    expect(added).toEqual([
      { kind: 'folder', id: 'f1', name: 'Grupo 1', server_ids: ['s1', 's4', 's2'] },
      { kind: 'server', server_id: 's3' }
    ])
  })

  it('moveFolderServer reordena servidores dentro da mesma pasta', () => {
    const items: RailLayoutItem[] = [
      { kind: 'folder', id: 'f1', name: 'Jogos', server_ids: ['s1', 's2', 's3'] }
    ]
    expect(moveFolderServer(items, 'f1', 0, 2)).toEqual([
      { kind: 'folder', id: 'f1', name: 'Jogos', server_ids: ['s2', 's3', 's1'] }
    ])
  })

  it('placeServerAtTopLevel tira servidor da pasta e posiciona no topo', () => {
    const items: RailLayoutItem[] = [
      { kind: 'folder', id: 'f1', name: 'Jogos', server_ids: ['s1', 's2'] },
      { kind: 'server', server_id: 's3' }
    ]
    const out = placeServerAtTopLevel(items, 's2', 2)
    expect(out).toEqual([
      { kind: 'folder', id: 'f1', name: 'Jogos', server_ids: ['s1'] },
      { kind: 'server', server_id: 's3' },
      { kind: 'server', server_id: 's2' }
    ])
  })

  it('renameFolder e ungroupFolder renomeiam e desfazem a pasta no lugar', () => {
    const items: RailLayoutItem[] = [
      { kind: 'server', server_id: 's1' },
      { kind: 'folder', id: 'f1', name: 'Antigo', server_ids: ['s2', 's3'] },
      { kind: 'server', server_id: 's4' }
    ]
    const renamed = renameFolder(items, 'f1', 'Novo Nome')
    expect(renamed[1]).toEqual({
      kind: 'folder',
      id: 'f1',
      name: 'Novo Nome',
      server_ids: ['s2', 's3']
    })

    const ungrouped = ungroupFolder(renamed, 'f1')
    expect(ungrouped).toEqual([
      { kind: 'server', server_id: 's1' },
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's3' },
      { kind: 'server', server_id: 's4' }
    ])
  })
})

describe('folderRailView', () => {
  it('soma os selos e prioriza minha call sobre call alheia', () => {
    expect(
      folderRailView(
        [
          { dimmed: false, badge: 3, voice: 'active' },
          { dimmed: true, badge: 5, voice: 'mine' }
        ],
        false
      )
    ).toEqual({ dimmed: false, badge: 8, voice: 'mine' })

    expect(
      folderRailView(
        [
          { dimmed: true, badge: 0, voice: null },
          { dimmed: true, badge: 0, voice: null }
        ],
        false
      )
    ).toEqual({ dimmed: true, badge: 0, voice: null })
  })
})
