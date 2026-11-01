import { ApiError } from './client'
import { wsConnectUrl } from './wsTicket'

const mockRequest = jest.fn()

jest.mock('./client', () => ({
  ...jest.requireActual('./client'),
  request: (...args: unknown[]) => mockRequest(...args)
}))

beforeEach(() => {
  mockRequest.mockReset()
})

describe('wsConnectUrl (mobile)', () => {
  it('pede o ticket e conecta com ?ticket= e client=mobile (o token não vai na URL)', async () => {
    mockRequest.mockResolvedValue({ ticket: 'abc_1', expires_in: 30 })
    const url = await wsConnectUrl(() => 'token-de-acesso')
    expect(mockRequest).toHaveBeenCalledWith('/ws/ticket', { method: 'POST' })
    expect(url).toBe('ws://localhost:8080/ws?ticket=abc_1&client=mobile')
  })

  it('sem sessão: não pede ticket nem conecta', async () => {
    expect(await wsConnectUrl(() => null)).toBeNull()
    expect(mockRequest).not.toHaveBeenCalled()
  })

  it('servidor antigo (404): conecta com o token como antes', async () => {
    mockRequest.mockRejectedValue(new ApiError(404, 'not found'))
    expect(await wsConnectUrl(() => 'tok')).toBe('ws://localhost:8080/ws?token=tok&client=mobile')
  })

  it('a sessão acabou no pedido: não conecta', async () => {
    let token: string | null = 'velho'
    mockRequest.mockImplementation(async () => {
      token = null
      throw new ApiError(401, 'sessão encerrada', 'session_revoked')
    })
    expect(await wsConnectUrl(() => token)).toBeNull()
  })

  it('rede fora: falha (o cliente tenta de novo com espera)', async () => {
    mockRequest.mockRejectedValue(new ApiError(0, 'Sem conexão com o servidor'))
    await expect(wsConnectUrl(() => 'tok')).rejects.toThrow('Sem conexão')
  })
})
