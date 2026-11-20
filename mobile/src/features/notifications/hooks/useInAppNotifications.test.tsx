import { act, renderHook } from '@testing-library/react-native'
import type { WsEvent } from '../../../shared/api/ws'
import { useAuthStore } from '../../auth/store/authStore'
import { useActiveRoomStore } from '../../chat/store/activeRoomStore'
import { presentInApp } from '../lib/expoPush'
import { useInAppNotifications } from './useInAppNotifications'
import { useMyRolesStore } from '../../servers/store/myRolesStore'

let wsHandler: (event: WsEvent) => void = () => {}
jest.mock('../../../shared/api/ws', () => ({
  onWsEvent: jest.fn((l: (e: WsEvent) => void) => ((wsHandler = l), () => {}))
}))
jest.mock('../lib/expoPush', () => ({ presentInApp: jest.fn().mockResolvedValue(undefined) }))
const mockListMyServerRoles = jest.fn()
jest.mock('../../servers/api/myRoles', () => ({ listMyServerRoles: () => mockListMyServerRoles() }))

const ME = { id: 'me', username: 'mugis', display_name: 'Mugis', email: 'm@x.co' }
const dm = { id: 'm1', author_id: 'u1', author: { id: 'u1', username: 'ana', display_name: 'Ana' }, conversation_id: 'c1', content: 'oi', created_at: '2026-10-30T01:00:00Z' }
const emit = (type: string, payload: object) => act(async () => wsHandler({ type, payload }))

describe('useInAppNotifications', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    wsHandler = () => {}
    useActiveRoomStore.setState({ active: null })
    useMyRolesStore.setState({ userId: null, byServer: {} })
    mockListMyServerRoles.mockResolvedValue({})
  })

  it('DM chegando com o app aberto e outra tela na frente: mostra o aviso', async () => {
    useAuthStore.setState({ status: 'signedIn', user: ME })
    await renderHook(() => useInAppNotifications())
    await emit('message:create', { message: dm })
    expect(presentInApp).toHaveBeenCalledWith(expect.objectContaining({ title: 'Ana', body: 'oi' }))
  })

  it('com a DM aberta, ou outro evento, não avisa', async () => {
    useAuthStore.setState({ status: 'signedIn', user: ME })
    useActiveRoomStore.setState({ active: { kind: 'conversation', id: 'c1' } })
    await renderHook(() => useInAppNotifications())
    await emit('message:create', { message: dm })
    await emit('message:update', { message: { ...dm, conversation_id: 'c9' } })
    expect(presentInApp).not.toHaveBeenCalled()
  })

  it('menção de um cargo meu num canal: carrega os meus cargos ao entrar e avisa', async () => {
    mockListMyServerRoles.mockResolvedValue({ s1: ['r1'] })
    useAuthStore.setState({ status: 'signedIn', user: ME })
    await renderHook(() => useInAppNotifications())
    await act(async () => {})
    const pinged = { ...dm, conversation_id: null, channel_id: 'ch1', content: '@suporte', mention_roles: [{ id: 'r1', handle: 'suporte' }] }
    await emit('message:create', { message: pinged, server_id: 's1' })
    expect(presentInApp).toHaveBeenCalledWith(expect.objectContaining({ body: '@suporte' }))
  })

  it('ao abrir o app a sessão volta antes do usuário: os cargos carregam quando ele chega', async () => {
    mockListMyServerRoles.mockResolvedValue({ s1: ['r1'] })
    // Como o authStore.restore(): signedIn primeiro, o usuário (getMe) depois.
    useAuthStore.setState({ status: 'signedIn', user: null })
    await renderHook(() => useInAppNotifications())
    await act(async () => {})
    expect(mockListMyServerRoles).not.toHaveBeenCalled()
    await act(async () => useAuthStore.setState({ user: ME }))
    expect(mockListMyServerRoles).toHaveBeenCalledTimes(1)
    const pinged = { ...dm, conversation_id: null, channel_id: 'ch1', content: '@suporte', mention_roles: [{ id: 'r1', handle: 'suporte' }] }
    await emit('message:create', { message: pinged, server_id: 's1' })
    expect(presentInApp).toHaveBeenCalledWith(expect.objectContaining({ body: '@suporte' }))
  })

  it('ganhar o cargo com o app aberto (server:member:roles) passa a avisar', async () => {
    useAuthStore.setState({ status: 'signedIn', user: ME })
    await renderHook(() => useInAppNotifications())
    await act(async () => {})
    const pinged = { ...dm, conversation_id: null, channel_id: 'ch1', content: '@suporte', mention_roles: [{ id: 'r1', handle: 'suporte' }] }
    await emit('message:create', { message: pinged, server_id: 's1' })
    expect(presentInApp).not.toHaveBeenCalled()
    await emit('server:member:roles', { server_id: 's1', user_id: 'outra', role_ids: ['r1'] })
    await emit('message:create', { message: pinged, server_id: 's1' })
    expect(presentInApp).not.toHaveBeenCalled()
    await emit('server:member:roles', { server_id: 's1', user_id: 'me', role_ids: ['r1'] })
    await emit('message:create', { message: pinged, server_id: 's1' })
    expect(presentInApp).toHaveBeenCalledTimes(1)
  })

  it('deslogado não escuta', async () => {
    useAuthStore.setState({ status: 'signedOut', user: null })
    await renderHook(() => useInAppNotifications())
    await emit('message:create', { message: dm })
    expect(presentInApp).not.toHaveBeenCalled()
  })
})
