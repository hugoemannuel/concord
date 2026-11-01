import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { ApiError } from '../../../../shared/api/client'
import { changeEmail, changeUsername, deleteAccount, logoutAll } from '../../../auth/api/account'
import { leaveDevice } from '../../lib/leaveDevice'
import { useAuthStore } from '../../../auth/store/authStore'
import { getBirthday, setBirthday } from '../../../profile/api/birthdays'
import { updateProfile } from '../../../profile/api/users'
import { MyAccountSection } from './MyAccountSection'
import { SettingsSectionScreen } from '../SettingsSectionScreen'

jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../../../auth/api/account', () => ({ changeUsername: jest.fn(), changeEmail: jest.fn(), deleteAccount: jest.fn(), logoutAll: jest.fn() }))
jest.mock('../../lib/leaveDevice', () => ({ leaveDevice: jest.fn() }))
jest.mock('../../../profile/api/birthdays', () => ({ getBirthday: jest.fn(), setBirthday: jest.fn() }))
jest.mock('../../../profile/api/users', () => ({ updateProfile: jest.fn(), getProfile: jest.fn() }))
jest.mock('../../../levels/api/levels', () => ({ fetchLevels: jest.fn().mockResolvedValue({}), fetchMyLevel: jest.fn() }))
jest.mock('../../../levels/api/badges', () => ({ fetchBadges: jest.fn().mockResolvedValue({ badges: [] }) }))

const user = { id: 'u1', username: 'ana', display_name: 'Ana', email: 'ana@gmail.com', created_at: '2026-01-15T12:00:00Z' }
const birthday = { day: 7, month: 3, year: 1998, announce: true }
const edit = (label: string) => fireEvent.press(screen.getByRole('button', { name: `Editar ${label}` }))

describe('MyAccountSection', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    useAuthStore.setState({ ...useAuthStore.getInitialState(), status: 'signedIn', user })
    jest.mocked(getBirthday).mockResolvedValue(birthday)
  })

  it('mostra o cartão e as linhas: nome, @, e-mail mascarado, aniversário e membro desde', async () => {
    await render(<MyAccountSection />)
    expect(await screen.findByText('7 de março de 1998')).toBeOnTheScreen()
    expect(screen.getByText('@ana')).toBeOnTheScreen()
    expect(screen.getByText(/\*{3}@gmail.com/)).toBeOnTheScreen()
    expect(screen.getByText(/jan.*2026/)).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Mostrar' }))
    expect(screen.getByText(/ana@gmail.com/)).toBeOnTheScreen()
  })

  it('nome de exibição: valida, salva e avisa', async () => {
    jest.mocked(updateProfile).mockResolvedValue({ ...user, display_name: 'Ana Maria' })
    await render(<MyAccountSection />)
    await edit('nome de exibição')
    await fireEvent.changeText(screen.getByLabelText('Nome de exibição'), '  ')
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Informe seu nome de exibição.')).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Nome de exibição'), 'Ana Maria')
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome salvo!')).toBeOnTheScreen()
    expect(useAuthStore.getState().user?.display_name).toBe('Ana Maria')
  })

  it('nome de exibição: falha do servidor mostra o aviso', async () => {
    jest.mocked(updateProfile).mockRejectedValue(new Error('x'))
    await render(<MyAccountSection />)
    await edit('nome de exibição')
    await fireEvent.changeText(screen.getByLabelText('Nome de exibição'), 'Novo')
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Não foi possível salvar. Tente de novo.')).toBeOnTheScreen()
  })

  it('nome de usuário: pede a senha, troca e avisa', async () => {
    jest.mocked(changeUsername).mockResolvedValue({ ...user, username: 'ana2' })
    await render(<MyAccountSection />)
    await edit('nome de usuário')
    await fireEvent.changeText(screen.getByLabelText('Nome de usuário'), 'ana2')
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Digite sua senha atual.')).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'segredo123')
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Nome de usuário trocado!')).toBeOnTheScreen()
    expect(changeUsername).toHaveBeenCalledWith('ana2', 'segredo123')
  })

  it('e-mail: senha errada mostra o erro do servidor', async () => {
    jest.mocked(changeEmail).mockRejectedValue(new ApiError(403, 'x', 'wrong_password'))
    await render(<MyAccountSection />)
    await edit('e-mail')
    await fireEvent.changeText(screen.getByLabelText('E-mail'), 'novo@gmail.com')
    await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'errada')
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Senha incorreta.')).toBeOnTheScreen()
  })

  it('nome de usuário dentro do prazo de 7 dias fica travado com o aviso', async () => {
    useAuthStore.setState({ user: { ...user, username_change_available_at: new Date(Date.now() + 3 * 86_400_000).toISOString() } })
    await render(<MyAccountSection />)
    await edit('nome de usuário')
    expect(screen.getByText(/Você pode trocar o nome de usuário de novo em/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
  })

  it('aniversário: edita e salva; data inválida bloqueia o botão', async () => {
    jest.mocked(setBirthday).mockImplementation(async (b) => b)
    await render(<MyAccountSection />)
    await screen.findByText('7 de março de 1998')
    await edit('aniversário')
    await fireEvent.changeText(screen.getByLabelText('Dia do aniversário'), '31')
    await fireEvent.press(screen.getByRole('button', { name: 'Mês do aniversário' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Abril' }))
    await fireEvent.changeText(screen.getByLabelText('Ano do aniversário'), '')
    expect(screen.getByText(/Escolha o dia, o mês e o ano/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled()
    await fireEvent.changeText(screen.getByLabelText('Ano do aniversário'), '1999')
    await fireEvent(screen.getByRole('switch', { name: 'Anunciar meu aniversário nos servidores' }), 'valueChange', false)
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Aniversário salvo!')).toBeOnTheScreen()
    expect(setBirthday).toHaveBeenCalledWith({ day: 30, month: 4, year: 1999, announce: false })
  })

  it('aniversário: erro do servidor aparece e o modal fica aberto; cancelar fecha', async () => {
    jest.mocked(setBirthday).mockRejectedValue(new Error('Falhou'))
    await render(<MyAccountSection />)
    await screen.findByText('7 de março de 1998')
    await edit('aniversário')
    await fireEvent.press(screen.getByRole('button', { name: 'Salvar' }))
    expect(await screen.findByText('Falhou')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(screen.queryByText('Falhou')).toBeNull())
  })
})

describe('SettingsSectionScreen', () => {
  beforeEach(() => {
    useAuthStore.setState({ ...useAuthStore.getInitialState(), status: 'signedIn', user })
    jest.mocked(getBirthday).mockResolvedValue(birthday)
  })

  it('seção desconhecida avisa; a conhecida mostra o título e o voltar funciona', async () => {
    const onBack = jest.fn()
    const { unmount } = await render(<SettingsSectionScreen id="nada" onBack={onBack} />)
    expect(screen.getByText('Seção não encontrada.')).toBeOnTheScreen()
    await unmount()
    await render(<SettingsSectionScreen id="account" onBack={onBack} />)
    expect(screen.getByText('Minha conta')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Voltar' }))
    expect(onBack).toHaveBeenCalled()
  })

  it('excluir conta: pede senha e confirmação, lista os servidores que impedem e sai quando dá certo', async () => {
    jest.mocked(deleteAccount).mockRejectedValueOnce(
      new ApiError(409, 'x', 'owns_servers', { servers: [{ id: 's1', name: 'Amigos' }] })
    )
    await render(<MyAccountSection />)
    await fireEvent.press(screen.getByRole('button', { name: 'Excluir conta' }))
    await fireEvent.changeText(screen.getByLabelText('Senha atual'), 'segredo')
    const submit = (): Promise<void> => fireEvent.press(screen.getAllByRole('button', { name: 'Excluir conta' }).at(-1)!)
    await submit()
    expect(await screen.findByText('Marque que você entende que não dá para desfazer.')).toBeOnTheScreen()
    await fireEvent(screen.getByLabelText('Entendo que a exclusão é definitiva.'), 'valueChange', true)
    await submit()
    expect(await screen.findByText(/Amigos/)).toBeOnTheScreen()
    expect(leaveDevice).not.toHaveBeenCalled()

    jest.mocked(deleteAccount).mockResolvedValueOnce(undefined)
    await submit()
    await waitFor(() => expect(leaveDevice).toHaveBeenCalled())
    expect(deleteAccount).toHaveBeenLastCalledWith('segredo')
  })

  it('sair de todos os dispositivos: confirma, avisa o servidor e sai deste aparelho', async () => {
    jest.mocked(logoutAll).mockResolvedValue(undefined)
    await render(<MyAccountSection />)
    await fireEvent.press(screen.getByRole('button', { name: 'Sair de todos os dispositivos' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Sair de todos' }))
    await waitFor(() => expect(leaveDevice).toHaveBeenCalled())
    expect(logoutAll).toHaveBeenCalled()
  })
})
