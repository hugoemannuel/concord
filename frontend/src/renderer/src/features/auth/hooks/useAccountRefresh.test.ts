import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const effects = vi.hoisted(() => [] as (() => (() => void) | void)[])
const getMe = vi.hoisted(() => vi.fn())
vi.mock('react', () => ({ useEffect: (fn: () => (() => void) | void) => effects.push(fn) }))
vi.mock('../../profile/api/users', () => ({ getMe }))

import { useAuthStore, type User } from '../store/authStore'
import { useAccountRefresh } from './useAccountRefresh'

// Alias: aqui o hook roda fora de um componente, de propósito (o useEffect é simulado).
const runHook: (hasToken: boolean) => void = useAccountRefresh

/** Roda o hook e devolve a limpeza do efeito. */
function mount(hasToken: boolean): () => void {
  const before = effects.length
  runHook(hasToken)
  return (effects[before]() as (() => void) | undefined) ?? (() => {})
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))

/** A conta como o app guardou no cadastro: e-mail ainda não confirmado. */
function ana(over: Partial<User> = {}): User {
  return {
    id: 'u1',
    username: 'ana',
    display_name: 'Ana',
    email: 'ana@salinha.app',
    email_verified: false,
    status: 'online',
    created_at: '',
    updated_at: '',
    ...over
  }
}

describe('useAccountRefresh', () => {
  beforeEach(() => {
    effects.length = 0
    getMe.mockReset()
    vi.stubGlobal('window', new EventTarget())
    useAuthStore.setState({ accessToken: 'token', user: ana() })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('ao abrir o app, relê a conta: o e-mail confirmado em outro navegador libera', async () => {
    getMe.mockResolvedValue(ana({ email_verified: true }))
    mount(true)
    await flush()
    expect(useAuthStore.getState().user?.email_verified).toBe(true)
  })

  it('não confirmou: a conta relida continua pedindo a confirmação', async () => {
    getMe.mockResolvedValue(ana())
    mount(true)
    await flush()
    expect(getMe).toHaveBeenCalledTimes(1)
    expect(useAuthStore.getState().user?.email_verified).toBe(false)
  })

  it('mantém o status escolhido nesta sessão', async () => {
    useAuthStore.setState({ user: ana({ status: 'dnd' }) })
    getMe.mockResolvedValue(ana({ email_verified: true, status: 'online' }))
    mount(true)
    await flush()
    expect(useAuthStore.getState().user?.status).toBe('dnd')
  })

  it('ao voltar para a janela sem ter confirmado, relê de novo', async () => {
    getMe.mockResolvedValueOnce(ana()).mockResolvedValueOnce(ana({ email_verified: true }))
    mount(true)
    await flush()
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(getMe).toHaveBeenCalledTimes(2)
    expect(useAuthStore.getState().user?.email_verified).toBe(true)
  })

  it('com o e-mail confirmado, voltar para a janela não relê', async () => {
    getMe.mockResolvedValue(ana({ email_verified: true }))
    mount(true)
    await flush()
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(getMe).toHaveBeenCalledTimes(1)
  })

  it('sem sessão, não relê nada', async () => {
    mount(false)
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(getMe).not.toHaveBeenCalled()
  })

  it('ao desmontar, para de ouvir o foco', async () => {
    getMe.mockResolvedValue(ana())
    const cleanup = mount(true)
    await flush()
    cleanup()
    window.dispatchEvent(new Event('focus'))
    await flush()
    expect(getMe).toHaveBeenCalledTimes(1)
  })
})
