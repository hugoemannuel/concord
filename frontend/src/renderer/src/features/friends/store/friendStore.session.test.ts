import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicUser } from '../../auth/store/authStore'
import { useAuthStore } from '../../auth/store/authStore'

// Resposta que chega depois de renovar o token vale; depois de sair, não.

const listFriends = vi.fn()
const listPending = vi.fn()
vi.mock('../api/friends', () => ({
  listFriends: (...a: unknown[]) => listFriends(...a),
  listPending: (...a: unknown[]) => listPending(...a),
  listBlocked: vi.fn(),
  sendFriendRequest: vi.fn(),
  acceptFriendRequest: vi.fn(),
  declineFriendRequest: vi.fn(),
  cancelFriendRequest: vi.fn(),
  removeFriend: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn()
}))

const { useFriendStore } = await import('./friendStore')

const ana = { id: 'ana', username: 'ana' } as PublicUser

beforeEach(() => {
  // Sem localStorage no teste: o persist do authStore só avisa.
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  useAuthStore.getState().clear()
  useAuthStore.getState().setTokens('A', 'R1')
  useFriendStore.getState().reset()
})

describe('friendStore e a sessão', () => {
  it('401 → refresh → sucesso no meio da requisição: a resposta vale', async () => {
    listFriends.mockImplementation(async () => {
      useAuthStore.getState().setTokens('B', 'R2')
      return [ana]
    })
    await useFriendStore.getState().fetchFriends()
    expect(useFriendStore.getState().friends).toEqual([ana])
  })

  it('sair no meio da requisição: a resposta é descartada', async () => {
    listFriends.mockImplementation(async () => {
      useAuthStore.getState().clear()
      return [ana]
    })
    await useFriendStore.getState().fetchFriends()
    expect(useFriendStore.getState().friends).toEqual([])
  })
})

describe('friendStore.fetchPending', () => {
  const req = { user_id: 'ana', username: 'ana', direction: 'incoming' }

  it('guarda os pedidos, mesmo com o token renovado no meio', async () => {
    listPending.mockImplementation(async () => {
      useAuthStore.getState().setTokens('B', 'R2')
      return [req, { username: 'sem id' }]
    })
    await useFriendStore.getState().fetchPending()
    expect(useFriendStore.getState().pending).toEqual([req])
  })

  it('erro esvazia a lista; depois de sair da conta, nem isso', async () => {
    useFriendStore.setState({ pending: [req] as never })
    listPending.mockRejectedValue(new Error('x'))
    await useFriendStore.getState().fetchPending()
    expect(useFriendStore.getState().pending).toEqual([])

    useFriendStore.setState({ pending: [req] as never })
    listPending.mockImplementation(async () => {
      useAuthStore.getState().clear()
      throw new Error('x')
    })
    await useFriendStore.getState().fetchPending()
    expect(useFriendStore.getState().pending).toEqual([req])
  })

  it('sair da conta no meio descarta a resposta', async () => {
    listPending.mockImplementation(async () => {
      useAuthStore.getState().clear()
      return [req]
    })
    await useFriendStore.getState().fetchPending()
    expect(useFriendStore.getState().pending).toEqual([])
  })
})
