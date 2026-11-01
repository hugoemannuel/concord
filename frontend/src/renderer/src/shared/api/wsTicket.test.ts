import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ request: vi.fn() }))

vi.mock('./client', async (orig) => ({
  ...(await orig<typeof import('./client')>()),
  request: h.request
}))
vi.mock('../lib/config', () => ({ WS_URL: 'wss://srv.exemplo/ws' }))

const { wsConnectUrl } = await import('./wsTicket')
const { ApiError } = await import('./client')

describe('wsConnectUrl', () => {
  beforeEach(() => { h.request.mockReset() })

  it('pede o ticket com o Bearer e conecta com ?ticket= (o token não vai na URL)', async () => {
    h.request.mockResolvedValue({ ticket: 'abc-123_x', expires_in: 30 })
    const url = await wsConnectUrl(() => 'token-de-acesso')
    expect(h.request).toHaveBeenCalledWith('/ws/ticket', { method: 'POST' })
    expect(url).toBe('wss://srv.exemplo/ws?ticket=abc-123_x')
    expect(url).not.toContain('token-de-acesso')
  })

  it('sem sessão: não pede ticket nem conecta', async () => {
    expect(await wsConnectUrl(() => null)).toBeNull()
    expect(h.request).not.toHaveBeenCalled()
  })

  it('servidor antigo (sem /ws/ticket, 404): conecta com o token como antes', async () => {
    h.request.mockRejectedValue(new ApiError(404, 'not found'))
    expect(await wsConnectUrl(() => 'a b')).toBe('wss://srv.exemplo/ws?token=a%20b')
  })

  it('a sessão acabou no pedido (o login foi limpo): não conecta', async () => {
    let token: string | null = 'velho'
    h.request.mockImplementation(async () => {
      token = null
      throw new ApiError(401, 'sessão encerrada', 'session_revoked')
    })
    expect(await wsConnectUrl(() => token)).toBeNull()
  })

  it('rede fora ou servidor com erro: falha (o cliente tenta de novo com espera)', async () => {
    h.request.mockRejectedValue(new ApiError(0, 'Sem conexão com o servidor'))
    await expect(wsConnectUrl(() => 'tok')).rejects.toThrow('Sem conexão')
    h.request.mockRejectedValue(new ApiError(503, 'tente de novo'))
    await expect(wsConnectUrl(() => 'tok')).rejects.toThrow('tente de novo')
  })
})
