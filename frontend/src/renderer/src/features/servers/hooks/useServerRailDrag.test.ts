import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RailLayoutItem } from '../lib/serverRailLayout'
import {
  RAIL_DRAG_MIME,
  buildRailDragHandlers,
  computeTopLevelDrop,
  encodeRailDrag,
  isSameDragSource,
  type RailDragSource,
  type RailDropTarget
} from '../lib/serverRailDrop'

const saveLayoutMock = vi.fn()
const toastErrorMock = vi.fn()

vi.mock('../api/serverLayout', () => ({
  getServerLayout: vi.fn(async () => []),
  saveServerLayout: (...args: unknown[]) => saveLayoutMock(...args)
}))

vi.mock('../../../shared/store/toastStore', () => ({
  showToast: { error: (...args: unknown[]) => toastErrorMock(...args) }
}))

vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => ({ accessToken: 'tok' }) }
}))

const { useServerLayoutStore } = await import('../store/serverLayoutStore')
const { commitRailLayout, executeRailDrop } = await import('./useServerRailDrag')

function makeDragEvent(y: number, raw = ''): React.DragEvent<HTMLDivElement> {
  const store = new Map<string, string>([[RAIL_DRAG_MIME, raw]])
  return {
    clientY: y,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    relatedTarget: null,
    currentTarget: {
      contains: () => false,
      getBoundingClientRect: () => ({ top: 0, height: 48 })
    },
    dataTransfer: {
      types: [RAIL_DRAG_MIME],
      effectAllowed: 'none',
      dropEffect: 'none',
      setData: (k: string, v: string) => store.set(k, v),
      getData: (k: string) => store.get(k) ?? ''
    }
  } as unknown as React.DragEvent<HTMLDivElement>
}

beforeEach(() => {
  saveLayoutMock.mockReset()
  toastErrorMock.mockReset()
  useServerLayoutStore.getState().reset()
})

describe('buildRailDragHandlers & commitRailLayout', () => {
  const items: RailLayoutItem[] = [
    { kind: 'server', server_id: 's1' },
    { kind: 'server', server_id: 's2' }
  ]

  it('fluxo completo de dragStart -> dragOver -> drop e isSameDragSource', () => {
    let drag: RailDragSource | null = null
    let dropTarget: RailDropTarget | null = null
    let finished: { source: RailDragSource | null; target: RailDropTarget | null } | null = null

    const s1Source: RailDragSource = { kind: 'server', serverId: 's1', folderId: null }
    const s1Handlers = buildRailDragHandlers(
      s1Source,
      (d, y, h) => computeTopLevelDrop(d, { kind: 'server', topIndex: 0, targetId: 's1' }, y, h),
      {
        get drag() {
          return drag
        },
        setDrag: (d) => {
          drag = d
        },
        setDropTarget: (t) => {
          dropTarget = t
        },
        onFinishDrop: (source, target) => {
          finished = { source, target }
        }
      }
    )

    s1Handlers.onDragStart?.(makeDragEvent(0))
    expect(isSameDragSource(drag, s1Source)).toBe(true)
    expect(isSameDragSource(drag, { kind: 'folder', folderId: 'f1' })).toBe(false)

    const s2Handlers = buildRailDragHandlers(
      { kind: 'server', serverId: 's2', folderId: null },
      (d, y, h) => computeTopLevelDrop(d, { kind: 'server', topIndex: 1, targetId: 's2' }, y, h),
      {
        drag,
        setDrag: (d) => {
          drag = d
        },
        setDropTarget: (t) => {
          dropTarget = t
        },
        onFinishDrop: (source, target) => {
          finished = { source, target }
        }
      }
    )

    s2Handlers.onDragOver?.(makeDragEvent(24))
    expect(dropTarget).toEqual({ scope: 'top', topIndex: 1, zone: 'inside', targetId: 's2' })

    s2Handlers.onDrop?.(makeDragEvent(24, encodeRailDrag(s1Source)))
    expect(drag).toBeNull()
    expect(dropTarget).toBeNull()
    expect(finished).toEqual({
      source: s1Source,
      target: { scope: 'top', topIndex: 1, zone: 'inside', targetId: 's2' }
    })

    s1Handlers.onDragEnd?.(makeDragEvent(0))
  })

  it('commitRailLayout salva e em caso de erro mostra toast e restaura estado', async () => {
    saveLayoutMock.mockImplementationOnce(async (x: RailLayoutItem[]) => x)
    await commitRailLayout(items)
    expect(useServerLayoutStore.getState().items).toEqual(items)

    saveLayoutMock.mockRejectedValueOnce(new Error('rede'))
    await commitRailLayout([{ kind: 'server', server_id: 's2' }])
    expect(toastErrorMock).toHaveBeenCalledWith('Não foi possível salvar a ordem dos servidores.')
    expect(useServerLayoutStore.getState().items).toEqual(items)
  })

  it('executeRailDrop ignora entradas nulas e cria pasta expandida abrindo modal de renomear ao soltar sobre servidor', () => {
    executeRailDrop(items, null, null)
    expect(saveLayoutMock).not.toHaveBeenCalled()

    saveLayoutMock.mockImplementationOnce(async (x: RailLayoutItem[]) => x)
    executeRailDrop(
      items,
      { kind: 'server', serverId: 's1', folderId: null },
      { scope: 'top', topIndex: 1, zone: 'inside', targetId: 's2' }
    )
    expect(saveLayoutMock).toHaveBeenCalledTimes(1)
    expect(useServerLayoutStore.getState().items[0]).toMatchObject({
      kind: 'folder',
      server_ids: ['s2', 's1']
    })
    expect(useServerLayoutStore.getState().folderModal).toMatchObject({
      mode: 'rename',
      initialName: 'Pasta de servidores'
    })
  })
})
