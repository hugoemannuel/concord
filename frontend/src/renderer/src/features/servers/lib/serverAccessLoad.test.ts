import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServer = vi.fn()
const listChannels = vi.fn()
vi.mock('../api/servers', () => ({ getServer: (id: string) => getServer(id) }))
vi.mock('../api/channels', () => ({ listChannels: (id: string) => listChannels(id) }))

const { loadServerMenuData } = await import('./serverAccessLoad')
const { Perm } = await import('./permissions')

const everyone = { id: 'r0', server_id: 's2', name: '@everyone', permissions: Perm.CREATE_INVITE, position: 0, is_default: true, color: null, hoist: false }

describe('loadServerMenuData', () => {
  beforeEach(() => {
    getServer.mockReset()
    listChannels.mockReset()
  })

  it('calcula as permissões da pessoa no servidor pedido', async () => {
    getServer.mockResolvedValue({
      server: { id: 's2', name: 'Outro', owner_id: 'dono' },
      members: [{ user_id: 'eu', server_id: 's2', role: 'member' }],
      roles: [everyone]
    })
    listChannels.mockResolvedValue([])
    const data = await loadServerMenuData('s2', 'eu')
    expect(getServer).toHaveBeenCalledWith('s2')
    expect(data.server.name).toBe('Outro')
    expect(data.access.isOwner).toBe(false)
    expect(data.access.can(Perm.CREATE_INVITE)).toBe(true)
    expect(data.access.can(Perm.MANAGE_CHANNELS)).toBe(false)
  })

  it('o dono do servidor pedido é dono, mesmo sem ser o servidor aberto', async () => {
    getServer.mockResolvedValue({
      server: { id: 's2', name: 'Meu', owner_id: 'eu' },
      members: [{ user_id: 'eu', server_id: 's2', role: 'member' }],
      roles: [everyone]
    })
    listChannels.mockResolvedValue(null)
    const data = await loadServerMenuData('s2', 'eu')
    expect(data.access.isOwner).toBe(true)
    expect(data.access.can(Perm.MANAGE_CHANNELS)).toBe(true)
  })

  it('quem não é membro não tem permissão nenhuma', async () => {
    getServer.mockResolvedValue({
      server: { id: 's2', name: 'X', owner_id: 'dono' },
      members: [],
      roles: [everyone]
    })
    listChannels.mockResolvedValue([])
    const data = await loadServerMenuData('s2', 'eu')
    expect(data.access.perms).toBe(0)
  })
})
