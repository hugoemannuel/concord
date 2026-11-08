import { describe, expect, it, vi } from 'vitest'
import { fetchMediaFile } from './mediaFile'

const response = (status: number): Response => new Response('x', { status })

describe('fetchMediaFile', () => {
  it('pede o arquivo com o token de mídia na URL e repassa o Range', async () => {
    const fetch = vi.fn(async () => response(206))
    const res = await fetchMediaFile('a1', { headers: { Range: 'bytes=0-9' } }, {
      baseUrl: 'http://h/api',
      token: async () => 'tk',
      invalidate: vi.fn(),
      fetch
    })
    expect(res.status).toBe(206)
    expect(fetch).toHaveBeenCalledWith('http://h/api/media/a1?token=tk', { headers: { Range: 'bytes=0-9' } })
  })

  it('token vencido (401): descarta e tenta uma vez com token novo', async () => {
    const tokens = ['velho', 'novo']
    const invalidate = vi.fn()
    const fetch = vi.fn(async (url: string) => response(url.endsWith('velho') ? 401 : 200))
    const res = await fetchMediaFile('a1', {}, {
      baseUrl: 'http://h/api',
      token: async () => tokens.shift()!,
      invalidate,
      fetch
    })
    expect(res.status).toBe(200)
    expect(invalidate).toHaveBeenCalledWith('velho')
    expect(fetch).toHaveBeenCalledTimes(2)
  })
})
