import { afterEach, describe, expect, it, vi } from 'vitest'
import { describeTest, serverHost, testConnection } from './connectionTest'

afterEach(() => vi.unstubAllGlobals())

describe('testConnection', () => {
  it('qualquer resposta HTTP conta como alcançou', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 400 })))
    expect((await testConnection()).kind).toBe('reached')
  })

  it('fetch que rejeita é inalcançável', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    expect(await testConnection()).toEqual({ kind: 'unreachable' })
  })

  it('tempo esgotado é separado de inalcançável', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError'))
    )
    expect(await testConnection()).toEqual({ kind: 'timeout' })
  })
})

describe('serverHost / describeTest', () => {
  it('pega só o host do endereço da API', () => {
    expect(serverHost('https://74-0-5-252.sslip.io/api')).toBe('74-0-5-252.sslip.io')
  })

  it('o texto de inalcançável sugere DNS e antivírus', () => {
    expect(describeTest({ kind: 'unreachable' }, 'x.io')).toMatch(/DNS.*antivírus/)
    expect(describeTest({ kind: 'reached', ms: 80 }, 'x.io')).toContain('80 ms')
  })
})
