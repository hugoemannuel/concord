import { fireEvent, render, screen } from '@testing-library/react-native'
import { fetchPresence } from '../../friends/api/presence'
import { usePresenceStore } from '../../friends/store/presenceStore'
import { getServerDetail, type ServerDetail } from '../api/members'
import { MembersSheet } from './MembersSheet'

jest.mock('react-native-safe-area-context', () => ({ ...jest.requireActual('react-native-safe-area-context'), useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../api/members', () => ({ getServerDetail: jest.fn() }))
jest.mock('../../friends/api/presence', () => ({ fetchPresence: jest.fn() }))

const detail: ServerDetail = {
  server: { id: 's1', name: 'Sala', owner_id: 'u-dono' },
  roles: [{ id: 'mods', name: 'Moderação', color: 0x3498db, position: 5, hoist: true, is_default: false }],
  members: [
    { user_id: 'u-dono', username: 'dono', display_name: 'Dona', role_ids: ['mods'] },
    { user_id: 'u-ana', username: 'ana', display_name: 'Ana', nickname: 'Aninha' },
    { user_id: 'u-off', username: 'off', display_name: 'Fora' },
    { user_id: 'bot-1', username: 'maestro', display_name: 'Maestro', is_bot: true }
  ]
}

describe('MembersSheet (membros do servidor, como no Discord)', () => {
  beforeEach(() => {
    usePresenceStore.getState().reset()
    jest.mocked(getServerDetail).mockResolvedValue(detail)
    // O servidor manda o Maestro sempre online, como qualquer pessoa conectada.
    jest.mocked(fetchPresence).mockResolvedValue({ 'u-dono': 'online', 'u-ana': 'idle', 'u-off': 'offline', 'bot-1': 'online' })
  })

  it('agrupa por cargo exibido, "Membros" e "Offline", com a contagem; o Maestro vem online do servidor', async () => {
    await render(<MembersSheet serverId="s1" onClose={jest.fn()} onOpenProfile={jest.fn()} />)
    expect(await screen.findByText('Moderação — 1')).toBeOnTheScreen()
    expect(await screen.findByText('Membros — 2')).toBeOnTheScreen()
    expect(screen.getByText('Offline — 1')).toBeOnTheScreen()
    expect(screen.getByText('BOT')).toBeOnTheScreen()
  })

  it('pede a presença de todos, bots inclusive (o app não força o bot online)', async () => {
    await render(<MembersSheet serverId="s1" onClose={jest.fn()} onOpenProfile={jest.fn()} />)
    expect(await screen.findByText('Moderação — 1')).toBeOnTheScreen()
    expect(fetchPresence).toHaveBeenCalledWith(['u-dono', 'u-ana', 'u-off', 'bot-1'])
  })

  it('apelido ganha do nome; o dono tem a coroa; tocar abre o perfil', async () => {
    const onOpenProfile = jest.fn()
    await render(<MembersSheet serverId="s1" onClose={jest.fn()} onOpenProfile={onOpenProfile} />)
    expect(await screen.findByText('Aninha')).toBeOnTheScreen()
    expect(screen.getByLabelText('Dono do servidor')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Aninha, @ana' }))
    expect(onOpenProfile).toHaveBeenCalledWith('u-ana')
  })

  it('falha ao carregar: aviso e tentar de novo', async () => {
    jest.mocked(getServerDetail).mockRejectedValueOnce(new Error('sem rede'))
    await render(<MembersSheet serverId="s1" onClose={jest.fn()} onOpenProfile={jest.fn()} />)
    expect(await screen.findByText('Não foi possível carregar os membros.')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(await screen.findByText('Moderação — 1')).toBeOnTheScreen()
  })
})
