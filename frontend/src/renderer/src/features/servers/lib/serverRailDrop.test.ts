import { describe, expect, it } from 'vitest'
import type { RailLayoutItem } from './serverRailLayout'
import {
  RAIL_DRAG_MIME,
  applyRailDrop,
  computeFolderMemberDrop,
  computeTopLevelDrop,
  decodeRailDrag,
  encodeRailDrag,
  type RailDragSource,
  type RailDropTarget
} from './serverRailDrop'

describe('encodeRailDrag / decodeRailDrag', () => {
  it('codifica e decodifica servidor e pasta com segurança', () => {
    const srv: RailDragSource = { kind: 'server', serverId: 's1', folderId: null }
    expect(decodeRailDrag(encodeRailDrag(srv))).toEqual(srv)

    const fld: RailDragSource = { kind: 'folder', folderId: 'f1' }
    expect(decodeRailDrag(encodeRailDrag(fld))).toEqual(fld)

    expect(decodeRailDrag('invalido')).toBeNull()
    expect(decodeRailDrag('{"kind":"outro"}')).toBeNull()
    expect(RAIL_DRAG_MIME).toBe('application/x-concord-server-rail')
  })
})

describe('computeTopLevelDrop', () => {
  const serverDrag: RailDragSource = { kind: 'server', serverId: 's1', folderId: null }
  const folderDrag: RailDragSource = { kind: 'folder', folderId: 'f1' }

  it('arrastando servidor sobre outro servidor: borda de cima = before, centro = inside, borda de baixo = after', () => {
    expect(
      computeTopLevelDrop(serverDrag, { kind: 'server', topIndex: 1, targetId: 's2' }, 4, 48)
    ).toEqual({ scope: 'top', topIndex: 1, zone: 'before', targetId: 's2' })

    expect(
      computeTopLevelDrop(serverDrag, { kind: 'server', topIndex: 1, targetId: 's2' }, 24, 48)
    ).toEqual({ scope: 'top', topIndex: 1, zone: 'inside', targetId: 's2' })

    expect(
      computeTopLevelDrop(serverDrag, { kind: 'server', topIndex: 1, targetId: 's2' }, 44, 48)
    ).toEqual({ scope: 'top', topIndex: 1, zone: 'after', targetId: 's2' })
  })

  it('arrastando item sobre si mesmo retorna null em qualquer zona', () => {
    expect(
      computeTopLevelDrop(serverDrag, { kind: 'server', topIndex: 0, targetId: 's1' }, 4, 48)
    ).toBeNull()
    expect(
      computeTopLevelDrop(serverDrag, { kind: 'server', topIndex: 0, targetId: 's1' }, 24, 48)
    ).toBeNull()
    expect(
      computeTopLevelDrop(folderDrag, { kind: 'folder', topIndex: 2, targetId: 'f1' }, 10, 48)
    ).toBeNull()
  })

  it('arrastando pasta sobre item do topo usa apenas before ou after (nunca inside)', () => {
    expect(
      computeTopLevelDrop(folderDrag, { kind: 'server', topIndex: 2, targetId: 's2' }, 20, 48)
    ).toEqual({ scope: 'top', topIndex: 2, zone: 'before', targetId: 's2' })

    expect(
      computeTopLevelDrop(folderDrag, { kind: 'server', topIndex: 2, targetId: 's2' }, 30, 48)
    ).toEqual({ scope: 'top', topIndex: 2, zone: 'after', targetId: 's2' })
  })
})

describe('computeFolderMemberDrop', () => {
  it('arrastando servidor sobre membro de pasta calcula before/after e ignora pasta ou próprio item', () => {
    const srvDrag: RailDragSource = { kind: 'server', serverId: 's3', folderId: null }
    expect(computeFolderMemberDrop(srvDrag, 'f1', 1, 's2', 10, 48)).toEqual({
      scope: 'folder-member',
      folderId: 'f1',
      memberIndex: 1,
      zone: 'before',
      targetId: 's2'
    })
    expect(computeFolderMemberDrop(srvDrag, 'f1', 1, 's2', 40, 48)).toEqual({
      scope: 'folder-member',
      folderId: 'f1',
      memberIndex: 1,
      zone: 'after',
      targetId: 's2'
    })
    expect(
      computeFolderMemberDrop(
        { kind: 'server', serverId: 's2', folderId: 'f1' },
        'f1',
        1,
        's2',
        10,
        48
      )
    ).toBeNull()
    expect(
      computeFolderMemberDrop({ kind: 'folder', folderId: 'f2' }, 'f1', 0, 's1', 10, 48)
    ).toBeNull()
  })
})

describe('applyRailDrop', () => {
  const base: RailLayoutItem[] = [
    { kind: 'server', server_id: 's1' },
    { kind: 'server', server_id: 's2' },
    { kind: 'folder', id: 'f1', name: 'Grupo', server_ids: ['s3', 's4'] }
  ]

  it('troca de lugar ao arrastar servidor adjacente para cima ou para baixo (before ou after)', () => {
    const dragS1: RailDragSource = { kind: 'server', serverId: 's1', folderId: null }
    const s1BeforeS2: RailDropTarget = { scope: 'top', topIndex: 1, zone: 'before', targetId: 's2' }
    expect(applyRailDrop(base, dragS1, s1BeforeS2, () => 'u').items.slice(0, 2)).toEqual([
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's1' }
    ])

    const dragS2: RailDragSource = { kind: 'server', serverId: 's2', folderId: null }
    const s2AfterS1: RailDropTarget = { scope: 'top', topIndex: 0, zone: 'after', targetId: 's1' }
    expect(applyRailDrop(base, dragS2, s2AfterS1, () => 'u').items.slice(0, 2)).toEqual([
      { kind: 'server', server_id: 's2' },
      { kind: 'server', server_id: 's1' }
    ])
  })

  it('soltar servidor no centro de outro servidor cria pasta com ambos', () => {
    const drag: RailDragSource = { kind: 'server', serverId: 's1', folderId: null }
    const target: RailDropTarget = { scope: 'top', topIndex: 1, zone: 'inside', targetId: 's2' }
    const res = applyRailDrop(base, drag, target, () => 'new-folder')
    expect(res.createdFolderId).toBe('new-folder')
    expect(res.items).toEqual([
      { kind: 'folder', id: 'new-folder', name: 'Pasta de servidores', server_ids: ['s2', 's1'] },
      { kind: 'folder', id: 'f1', name: 'Grupo', server_ids: ['s3', 's4'] }
    ])
  })

  it('soltar servidor no centro de uma pasta existente adiciona ao fim da pasta', () => {
    const drag: RailDragSource = { kind: 'server', serverId: 's1', folderId: null }
    const target: RailDropTarget = { scope: 'top', topIndex: 2, zone: 'inside', targetId: 'f1' }
    const res = applyRailDrop(base, drag, target, () => 'unused')
    expect(res.items).toEqual([
      { kind: 'server', server_id: 's2' },
      { kind: 'folder', id: 'f1', name: 'Grupo', server_ids: ['s3', 's4', 's1'] }
    ])
  })

  it('soltar servidor de dentro de pasta no topo tira da pasta e posiciona no topo', () => {
    const drag: RailDragSource = { kind: 'server', serverId: 's4', folderId: 'f1' }
    const target: RailDropTarget = { scope: 'top', topIndex: 0, zone: 'before', targetId: 's1' }
    const res = applyRailDrop(base, drag, target, () => 'unused')
    expect(res.items).toEqual([
      { kind: 'server', server_id: 's4' },
      { kind: 'server', server_id: 's1' },
      { kind: 'server', server_id: 's2' },
      { kind: 'folder', id: 'f1', name: 'Grupo', server_ids: ['s3'] }
    ])
  })

  it('soltar pasta antes do primeiro item move a pasta inteira para o topo', () => {
    const drag: RailDragSource = { kind: 'folder', folderId: 'f1' }
    const target: RailDropTarget = { scope: 'top', topIndex: 0, zone: 'before', targetId: 's1' }
    const res = applyRailDrop(base, drag, target, () => 'unused')
    expect(res.items).toEqual([
      { kind: 'folder', id: 'f1', name: 'Grupo', server_ids: ['s3', 's4'] },
      { kind: 'server', server_id: 's1' },
      { kind: 'server', server_id: 's2' }
    ])
  })

  it('soltar servidor sobre membro de uma pasta reordena ou insere na posição certa', () => {
    const sameFolderDrag: RailDragSource = { kind: 'server', serverId: 's3', folderId: 'f1' }
    const targetBefore: RailDropTarget = {
      scope: 'folder-member',
      folderId: 'f1',
      memberIndex: 1,
      zone: 'before',
      targetId: 's4'
    }
    expect(applyRailDrop(base, sameFolderDrag, targetBefore, () => 'u').items[2]).toEqual({
      kind: 'folder',
      id: 'f1',
      name: 'Grupo',
      server_ids: ['s4', 's3']
    })

    const outsideDrag: RailDragSource = { kind: 'server', serverId: 's1', folderId: null }
    expect(applyRailDrop(base, outsideDrag, targetBefore, () => 'u').items).toEqual([
      { kind: 'server', server_id: 's2' },
      { kind: 'folder', id: 'f1', name: 'Grupo', server_ids: ['s3', 's1', 's4'] }
    ])
  })
})
