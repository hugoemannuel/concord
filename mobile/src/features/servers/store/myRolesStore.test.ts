import { useAuthStore } from '../../auth/store/authStore'
import { roleIdsOf, useMyRolesStore } from './myRolesStore'

const mockListMyServerRoles = jest.fn()
jest.mock('../api/myRoles', () => ({ listMyServerRoles: () => mockListMyServerRoles() }))

const ME = { id: 'me', username: 'mugis', display_name: 'Mugis', email: 'm@x.co' }
const mine = (serverId: string | null): string[] => roleIdsOf(useMyRolesStore.getState(), useAuthStore.getState().user?.id, serverId)

describe('myRolesStore', () => {
  beforeEach(() => {
    mockListMyServerRoles.mockReset()
    useAuthStore.setState({ status: 'signedIn', user: ME })
    useMyRolesStore.setState({ userId: null, byServer: {} })
  })

  it('carrega os meus cargos de todos os servidores', async () => {
    mockListMyServerRoles.mockResolvedValue({ s1: ['vip'], s2: ['mod'] })
    await useMyRolesStore.getState().load()
    expect(mine('s1')).toEqual(['vip'])
    expect(mine('s2')).toEqual(['mod'])
    expect(mine('outro')).toEqual([])
    expect(mine(null)).toEqual([])
  })

  it('os cargos de outra conta não valem para quem entrou depois', async () => {
    mockListMyServerRoles.mockResolvedValue({ s1: ['vip'] })
    await useMyRolesStore.getState().load()
    useAuthStore.setState({ user: { ...ME, id: 'outra' } })
    expect(mine('s1')).toEqual([])
  })

  it('trocar de conta durante a carga descarta a resposta; falha da rota não derruba nada', async () => {
    let finish: (v: Record<string, string[]>) => void = () => {}
    mockListMyServerRoles.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const loading = useMyRolesStore.getState().load()
    useAuthStore.setState({ user: { ...ME, id: 'outra' } })
    finish({ s1: ['vip'] })
    await loading
    expect(useMyRolesStore.getState().byServer).toEqual({})

    mockListMyServerRoles.mockRejectedValue(new Error('fora do ar'))
    await expect(useMyRolesStore.getState().load()).resolves.toBeUndefined()
  })

  it('server:member:roles: só o evento sobre mim troca os meus cargos', async () => {
    mockListMyServerRoles.mockResolvedValue({ s1: ['vip'], s2: ['mod'] })
    await useMyRolesStore.getState().load()
    useMyRolesStore.getState().applyMemberRoles('me', { server_id: 's1', user_id: 'outra', role_ids: [] })
    expect(mine('s1')).toEqual(['vip'])
    useMyRolesStore.getState().applyMemberRoles('me', { server_id: 's1', user_id: 'me', role_ids: ['vip', 'suporte'] })
    expect(mine('s1')).toEqual(['vip', 'suporte'])
    expect(mine('s2')).toEqual(['mod'])
  })
})
