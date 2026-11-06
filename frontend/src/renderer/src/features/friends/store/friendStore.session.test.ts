import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicUser } from '../../auth/store/authStore'
import { useAuthStore } from '../../auth/store/authStore'

// Resposta que chega depois de renovar o token vale; depois de sair, não.

const listFriends = vi.fn()
vi.mock('../api/friends', () => ({
  listFriends: (...a: unknown[]) => listFriends(...a),
  listPending: vi.fn(),
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
