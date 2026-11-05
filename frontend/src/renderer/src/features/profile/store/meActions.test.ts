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
vi.mock('../../auth/store/authStore', () => ({ useAuthStore: { getState: () => ({}) } }))
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

import { logoutAndReset } from './meActions'

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
