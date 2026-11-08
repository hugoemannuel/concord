import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Message } from '../../chat/api/messages'

const api = vi.hoisted(() => ({
  getLinkPreview: vi.fn(),
  suppressEmbeds: vi.fn()
}))
vi.mock('../api/linkPreviews', () => api)
// O chatStore de verdade puxa áudio/WebRTC; aqui basta o setState.
const chat = vi.hoisted(() => ({ setState: vi.fn() }))
vi.mock('../../chat/store/chatStore', () => ({ useChatStore: chat }))

import { useLinkPreviewStore } from './linkPreviewStore'

const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('linkPreviewStore', () => {
  beforeEach(() => {
    useLinkPreviewStore.getState().reset()
    api.getLinkPreview.mockReset()
    api.suppressEmbeds.mockReset()
  })

  it('busca cada URL uma vez e guarda o cartão', async () => {
    api.getLinkPreview.mockResolvedValue({ url: 'https://a.com', title: 'A' })
    const { ensure } = useLinkPreviewStore.getState()
    ensure('https://a.com')
    ensure('https://a.com')
    await flush()
    ensure('https://a.com')

    expect(api.getLinkPreview).toHaveBeenCalledTimes(1)
    expect(useLinkPreviewStore.getState().entries['https://a.com']).toEqual({
      status: 'ready',
      preview: { url: 'https://a.com', title: 'A' }
    })
  })

  it('sem prévia (204) fica guardado e não busca de novo', async () => {
    api.getLinkPreview.mockResolvedValue(null)
    useLinkPreviewStore.getState().ensure('https://b.com')
    await flush()
    useLinkPreviewStore.getState().ensure('https://b.com')

    expect(useLinkPreviewStore.getState().entries['https://b.com']).toEqual({ status: 'none' })
    expect(api.getLinkPreview).toHaveBeenCalledTimes(1)
  })

  it('falha passageira (limite, rede) tenta de novo quando o cartão aparece outra vez', async () => {
    api.getLinkPreview.mockRejectedValueOnce(new Error('429')).mockResolvedValueOnce({ url: 'https://c.com', title: 'C' })
    useLinkPreviewStore.getState().ensure('https://c.com')
    await flush()
    useLinkPreviewStore.getState().ensure('https://c.com')
    await flush()

    expect(api.getLinkPreview).toHaveBeenCalledTimes(2)
    expect(useLinkPreviewStore.getState().entries['https://c.com']?.status).toBe('ready')
  })

  it('removeEmbeds chama a rota e aplica a mensagem na sala', async () => {
    const msg: Message = { id: 'm1', author_id: 'ana', channel_id: 'ch1', content: 'https://a.com', created_at: '2026-11-07T12:00:00Z' }
    api.suppressEmbeds.mockResolvedValue({ ...msg, embeds_suppressed: true })

    await useLinkPreviewStore.getState().removeEmbeds(msg)

    expect(api.suppressEmbeds).toHaveBeenCalledWith('channel:ch1', 'm1')
    const apply = chat.setState.mock.calls[0][0] as (s: unknown) => { messagesByRoom: Record<string, Message[]> }
    const next = apply({ messagesByRoom: { 'channel:ch1': [msg] }, conversations: [] })
    expect(next.messagesByRoom['channel:ch1'][0].embeds_suppressed).toBe(true)
  })
})
