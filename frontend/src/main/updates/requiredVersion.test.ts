import { describe, expect, it, vi } from 'vitest'
import { requiredUpdateCheck } from './requiredVersion'

type FetchMock = ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>

const answer = (body: unknown, ok = true): FetchMock =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response)

describe('requiredUpdateCheck', () => {
  it('pergunta ao servidor escolhido a versão mínima', async () => {
    const fetchFn = answer({ min_version: '1.2.0' })
    const check = requiredUpdateCheck({
      serverUrl: 'https://s.example/',
      currentVersion: '1.1.0',
      fetch: fetchFn
    })
    expect(await check()).toBe(true)
    expect(fetchFn).toHaveBeenCalledWith(
      'https://s.example/api/changelog/required',
      expect.anything()
    )
  })

  it('na mínima, acima dela ou sem mínima: não é obrigatória', async () => {
    const at = requiredUpdateCheck({
      serverUrl: 'https://s',
      currentVersion: '1.2.0',
      fetch: answer({ min_version: '1.2.0' })
    })
    const none = requiredUpdateCheck({
      serverUrl: 'https://s',
      currentVersion: '1.0.0',
      fetch: answer({ min_version: '' })
    })
    expect(await at()).toBe(false)
    expect(await none()).toBe(false)
  })

  it('sem servidor, resposta de erro ou corpo estranho: não é obrigatória', async () => {
    const fetchFn = answer({ min_version: '9.9.9' })
    expect(
      await requiredUpdateCheck({ serverUrl: undefined, currentVersion: '1.0.0', fetch: fetchFn })()
    ).toBe(false)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(
      await requiredUpdateCheck({
        serverUrl: 'https://s',
        currentVersion: '1.0.0',
        fetch: answer({}, false)
      })()
    ).toBe(false)
    expect(
      await requiredUpdateCheck({
        serverUrl: 'https://s',
        currentVersion: '1.0.0',
        fetch: answer(null)
      })()
    ).toBe(false)
  })

  it('servidor que não responde: desiste no prazo (a janelinha não espera)', async () => {
    vi.useFakeTimers()
    const fetchFn = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('abortado')))
        )
    )
    const pending = requiredUpdateCheck({
      serverUrl: 'https://s',
      currentVersion: '1.0.0',
      fetch: fetchFn,
      timeoutMs: 100
    })()
    await vi.advanceTimersByTimeAsync(100)
    await expect(pending).rejects.toThrow()
    vi.useRealTimers()
  })
})
