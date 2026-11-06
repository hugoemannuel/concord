import { beforeEach, describe, expect, it, vi } from 'vitest'

const calls = vi.hoisted(() => [] as string[])
const track = (name: string) => (): void => {
  calls.push(name)
}

vi.mock('../../auth/api/auth', () => ({
  logout: vi.fn(async () => {
    calls.push('logout')
  })
}))
vi.mock('../../../shared/api/client', () => ({
  clearSession: vi.fn(async () => {
    calls.push('clearSession')
  })
}))
vi.mock('../api/users', () => ({ setStatus: vi.fn() }))
vi.mock('../../../app/router', () => ({ default: { navigate: vi.fn() } }))
vi.mock('../../../shared/store/toastStore', () => ({ showToast: { error: vi.fn() } }))
const auth = vi.hoisted(() => {
  const state = {
    user: null as { id: string; status?: string } | null,
    setUser: (user: { id: string; status?: string } | null): void => {
      state.user = user
    }
  }
  return state
})
vi.mock('../../auth/store/authStore', () => ({ useAuthStore: { getState: () => auth } }))
vi.mock('../../servers/store/channelNameStore', () => ({
  useChannelNameStore: { getState: () => ({ reset: track('channelNames') }) }
}))
vi.mock('../../chat/store/chatStore', () => ({
  useChatStore: { getState: () => ({ disconnect: track('chat.disconnect') }) }
}))
vi.mock('../../chat/store/searchStore', () => ({
  useSearchStore: { getState: () => ({ close: track('search.close') }) }
}))
vi.mock('../../chat/store/draftStore', () => ({
  useDraftStore: { getState: () => ({ clear: track('drafts.clear') }) }
}))
vi.mock('../../call/store/callStore', () => ({
  useCallStore: { getState: () => ({ endCall: track('call.endCall') }) }
}))
vi.mock('../../friends/store/friendStore', () => ({
  useFriendStore: { getState: () => ({ reset: track('friends') }) }
}))
vi.mock('./profileCardStore', () => ({
  useProfileCardStore: { getState: () => ({ close: track('profileCard') }) }
}))
vi.mock('./profileStore', () => ({
  useProfileStore: { getState: () => ({ reset: track('profiles') }) }
}))
vi.mock('../../servers/store/serverStore', () => ({
  useServerStore: { getState: () => ({ reset: track('servers') }) }
}))
vi.mock('../../settings/store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ forceClose: track('settings') }) }
}))

import { changeMyStatus, logoutAndReset } from './meActions'
import { setStatus } from '../api/users'
import { showToast } from '../../../shared/store/toastStore'

describe('logoutAndReset', () => {
  beforeEach(() => {
    calls.length = 0
  })

  it('encerra a chamada em andamento (senão o microfone fica aberto para o próximo usuário)', async () => {
    await logoutAndReset()
    expect(calls).toContain('call.endCall')
  })

  it('encerra a chamada antes de fechar o WebSocket, para o aviso de saída ainda sair', async () => {
    await logoutAndReset()
    const end = calls.indexOf('call.endCall')
    expect(end).toBeGreaterThanOrEqual(0)
    expect(end).toBeLessThan(calls.indexOf('chat.disconnect'))
  })

  it('fecha a busca, que guarda resultados da conta que saiu', async () => {
    await logoutAndReset()
    expect(calls).toContain('search.close')
  })

  it('apaga os rascunhos, que não podem passar para a próxima conta', async () => {
    await logoutAndReset()
    expect(calls).toContain('drafts.clear')
  })

  it('limpa a sessão local mesmo se o servidor recusar o logout', async () => {
    const { logout } = await import('../../auth/api/auth')
    vi.mocked(logout).mockRejectedValueOnce(new Error('offline'))
    await logoutAndReset()
    expect(calls).toContain('clearSession')
    expect(calls).toContain('call.endCall')
  })
})

describe('changeMyStatus', () => {
  beforeEach(() => {
    auth.user = { id: 'u1', status: 'online' }
    vi.mocked(setStatus).mockReset()
    vi.mocked(showToast.error).mockClear()
  })

  it('sem usuário ou status igual: nem chama o servidor', async () => {
    await changeMyStatus('online')
    auth.user = null
    await changeMyStatus('idle')
    expect(setStatus).not.toHaveBeenCalled()
  })

  it('troca na hora e fica com o status que o servidor devolveu', async () => {
    let during: string | undefined
    vi.mocked(setStatus).mockImplementation(async () => {
      during = auth.user?.status
      return { status: 'dnd' } as never
    })
    await changeMyStatus('idle')
    expect(during).toBe('idle')
    expect(auth.user?.status).toBe('dnd')
  })

  it('servidor sem status na resposta: mantém o escolhido', async () => {
    vi.mocked(setStatus).mockResolvedValue({} as never)
    await changeMyStatus('idle')
    expect(auth.user?.status).toBe('idle')
  })

  it('servidor recusou: desfaz e avisa (mensagem do erro ou o padrão)', async () => {
    vi.mocked(setStatus).mockRejectedValueOnce(new Error('offline'))
    await changeMyStatus('idle')
    expect(auth.user?.status).toBe('online')
    expect(showToast.error).toHaveBeenLastCalledWith('offline')
    vi.mocked(setStatus).mockRejectedValueOnce('x')
    await changeMyStatus('idle')
    expect(showToast.error).toHaveBeenLastCalledWith('Não foi possível mudar o status.')
  })

  it('saiu da conta no meio: não recria o usuário', async () => {
    vi.mocked(setStatus).mockImplementationOnce(async () => {
      auth.user = null
      return { status: 'idle' } as never
    })
    await changeMyStatus('idle')
    expect(auth.user).toBeNull()
    vi.mocked(setStatus).mockImplementationOnce(async () => {
      auth.user = null
      throw new Error('offline')
    })
    auth.user = { id: 'u1', status: 'online' }
    await changeMyStatus('idle')
    expect(auth.user).toBeNull()
  })
})
