import { beforeEach, describe, expect, it, vi } from 'vitest'

const listMyServerRoles = vi.fn()
vi.mock('../api/channels', () => ({}))
vi.mock('../api/servers', () => ({}))
vi.mock('../api/invites', () => ({}))
vi.mock('../api/serverLayout', () => ({}))
vi.mock('../api/roles', () => ({ listMyServerRoles: () => listMyServerRoles() }))

const auth = { user: { id: 'eu' } as { id: string } | null, sessionEpoch: 1 }
vi.mock('../../auth/store/authStore', () => ({
  useAuthStore: { getState: () => auth }
}))

const { useMyRolesStore, myRoleIdsIn } = await import('./myRolesStore')
const { handleServerRoleEvent } = await import('./serverEvents')

const deps = { onServerRemoved: vi.fn(), onPermissionsChanged: vi.fn() }
const send = (type: string, payload: Record<string, unknown>): boolean =>
  handleServerRoleEvent({ type, payload }, deps)

beforeEach(() => {
  auth.user = { id: 'eu' }
  auth.sessionEpoch = 1
  listMyServerRoles.mockReset()
  useMyRolesStore.setState({ userId: null, byServer: {} })
})

describe('myRolesStore', () => {
  it('carrega os meus cargos de todos os servidores', async () => {
    listMyServerRoles.mockResolvedValue({ s1: ['vip', 'suporte'], s2: ['mod'] })
    await useMyRolesStore.getState().fetchMyRoles()
    expect(myRoleIdsIn('s1')).toEqual(['vip', 'suporte'])
    expect(myRoleIdsIn('s2')).toEqual(['mod'])
  })

  it('servidor sem cargo, desconhecido ou sem servidor: lista vazia (e sempre a mesma)', async () => {
    listMyServerRoles.mockResolvedValue({ s1: ['vip'] })
    await useMyRolesStore.getState().fetchMyRoles()
    expect(myRoleIdsIn('outro')).toEqual([])
    expect(myRoleIdsIn(null)).toEqual([])
    expect(myRoleIdsIn('outro')).toBe(myRoleIdsIn(null))
  })

  it('os cargos de outra conta não valem para quem entrou depois', async () => {
    listMyServerRoles.mockResolvedValue({ s1: ['vip'] })
    await useMyRolesStore.getState().fetchMyRoles()
    auth.user = { id: 'outra-pessoa' }
    expect(myRoleIdsIn('s1')).toEqual([])
  })

  it('resposta que chega depois de trocar de conta é descartada', async () => {
    let finish: (v: Record<string, string[]>) => void = () => {}
    listMyServerRoles.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const loading = useMyRolesStore.getState().fetchMyRoles()
    auth.sessionEpoch = 2
    finish({ s1: ['vip'] })
    await loading
    expect(useMyRolesStore.getState().byServer).toEqual({})
  })

  it('evento que chega no meio da carga não é atropelado pela resposta antiga: relê', async () => {
    let finish: (v: Record<string, string[]>) => void = () => {}
    listMyServerRoles
      .mockReturnValueOnce(new Promise((resolve) => (finish = resolve)))
      .mockResolvedValueOnce({ s1: ['vip', 'suporte'] })
    const loading = useMyRolesStore.getState().fetchMyRoles()
    send('server:member:roles', { server_id: 's1', user_id: 'eu', role_ids: ['vip', 'suporte'] })
    finish({ s1: ['vip'] }) // foto tirada antes do evento
    await loading
    expect(myRoleIdsIn('s1')).toEqual(['vip', 'suporte'])
    expect(listMyServerRoles).toHaveBeenCalledTimes(2)
  })

  it('falha na rota não derruba nada: fica sem os cargos', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    listMyServerRoles.mockRejectedValue(new Error('fora do ar'))
    await useMyRolesStore.getState().fetchMyRoles()
    expect(myRoleIdsIn('s1')).toEqual([])
    error.mockRestore()
  })
})

describe('eventos do servidor', () => {
  beforeEach(async () => {
    listMyServerRoles.mockResolvedValue({ s1: ['vip'], s2: ['mod'] })
    await useMyRolesStore.getState().fetchMyRoles()
  })

  it('server:member:roles comigo troca os meus cargos naquele servidor', () => {
    send('server:member:roles', { server_id: 's1', user_id: 'eu', role_ids: ['vip', 'suporte'] })
    expect(myRoleIdsIn('s1')).toEqual(['vip', 'suporte'])
    expect(myRoleIdsIn('s2')).toEqual(['mod'])
  })

  it('server:member:roles de outra pessoa não mexe nos meus', () => {
    send('server:member:roles', { server_id: 's1', user_id: 'bia', role_ids: [] })
    expect(myRoleIdsIn('s1')).toEqual(['vip'])
  })

  it('server:removed esquece os cargos daquele servidor', () => {
    send('server:removed', { server_id: 's1', reason: 'kick' })
    expect(myRoleIdsIn('s1')).toEqual([])
    expect(myRoleIdsIn('s2')).toEqual(['mod'])
  })
})
