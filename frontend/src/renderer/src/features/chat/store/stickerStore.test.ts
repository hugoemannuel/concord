import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStickerStore } from './stickerStore'
import * as stickersApi from '../api/stickers'

describe('stickerStore', () => {
  beforeEach(() => {
    useStickerStore.setState({
      stickersByServer: {}
    })
    vi.restoreAllMocks()
  })

  it('inicia vazio', () => {
    const state = useStickerStore.getState()
    expect(state.stickersByServer).toEqual({})
  })

  it('carrega as figurinhas de todos os servidores da pessoa', async () => {
    const mockStickers: stickersApi.ServerSticker[] = [
      {
        id: 'stk-1',
        server_id: 'srv-1',
        uploader_id: 'user-1',
        name: 'risada',
        content_type: 'image/webp',
        size_bytes: 5000,
        created_at: new Date().toISOString()
      }
    ]

    vi.spyOn(stickersApi, 'fetchMyStickers').mockResolvedValue([
      { server_id: 'srv-1', server_name: 'Alfa', stickers: mockStickers }
    ])

    await useStickerStore.getState().loadMine()
    expect(useStickerStore.getState().stickersByServer['srv-1']).toEqual(mockStickers)
  })

  it('sem rede, o seletor fica com o que já tinha', async () => {
    useStickerStore.setState({ stickersByServer: { 'srv-1': [] } })
    vi.spyOn(stickersApi, 'fetchMyStickers').mockRejectedValue(new Error('offline'))

    await useStickerStore.getState().loadMine()
    expect(useStickerStore.getState().stickersByServer).toEqual({ 'srv-1': [] })
  })

  it('adiciona figurinha no upload', async () => {
    const created: stickersApi.ServerSticker = {
      id: 'stk-2',
      server_id: 'srv-1',
      uploader_id: 'user-1',
      name: 'valeu',
      content_type: 'image/png',
      size_bytes: 4000,
      created_at: new Date().toISOString()
    }

    vi.spyOn(stickersApi, 'uploadServerSticker').mockResolvedValue(created)

    const blob = new Blob(['dummy'], { type: 'image/png' })
    await useStickerStore.getState().uploadSticker('srv-1', 'valeu', blob)

    const list = useStickerStore.getState().stickersByServer['srv-1']
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('stk-2')
  })

  it('trata evento de WS sticker:created e sticker:deleted', () => {
    const store = useStickerStore.getState()
    const stk: stickersApi.ServerSticker = {
      id: 'stk-ws',
      server_id: 'srv-ws',
      uploader_id: 'user-2',
      name: 'top',
      content_type: 'image/gif',
      size_bytes: 8000,
      created_at: new Date().toISOString()
    }

    // Evento created
    const handledCreate = store.handleWsEvent({
      type: 'sticker:created',
      payload: {
        server_id: 'srv-ws',
        sticker: stk
      }
    })
    expect(handledCreate).toBe(true)
    expect(useStickerStore.getState().stickersByServer['srv-ws']).toEqual([stk])

    // Evento deleted
    const handledDelete = store.handleWsEvent({
      type: 'sticker:deleted',
      payload: {
        server_id: 'srv-ws',
        sticker_id: 'stk-ws'
      }
    })
    expect(handledDelete).toBe(true)
    expect(useStickerStore.getState().stickersByServer['srv-ws']).toEqual([])
  })
})
