import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { useNetworkStore } from '../../../shared/store/networkStore'
import type { SendOutcome } from '../hooks/useRoomMessages'
import { uploadAttachment } from '../api/upload'
import { pickDocuments, pickFromCamera, pickFromGallery } from '../lib/pickFiles'
import { Composer } from './Composer'

jest.mock('../hooks/useGifSearch', () => ({
  useGifSearch: () => ({ gifs: [{ id: 'g1', title: 'gatinho', url: 'https://g/u.gif', preview_url: 'https://g/p.gif', width: 200, height: 100 }], loading: false })
}))
jest.mock('../hooks/useServerStickers', () => ({
  useServerStickers: (serverId: string | null | undefined) => ({
    stickers: serverId ? [{ id: 's1', server_id: serverId, uploader_id: 'u', name: 'oi', content_type: 'image/png', size_bytes: 1, created_at: '' }] : [],
    loading: false
  })
}))
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }))
jest.mock('../api/upload', () => ({ uploadAttachment: jest.fn() }))
jest.mock('../lib/pickFiles', () => ({ pickDocuments: jest.fn(), pickFromGallery: jest.fn(), pickFromCamera: jest.fn() }))
jest.mock('../store/mediaToken', () => ({ ensureMediaToken: jest.fn().mockResolvedValue('tk'), invalidateMediaToken: jest.fn() }))

const type = (text: string) => fireEvent.changeText(screen.getByLabelText('Mensagem para #geral'), text)
const press = () => fireEvent.press(screen.getByRole('button', { name: 'Enviar' }))
const FORBIDDEN = 'Você não tem permissão para enviar mensagens neste canal.'
const setup = (onSend: (t: string) => Promise<SendOutcome>, forbiddenNotice: string | null = FORBIDDEN) =>
  render(<Composer label="Mensagem para #geral" room="channel:c1" onSend={onSend} forbiddenNotice={forbiddenNotice ?? undefined} />)

describe('Composer', () => {
  beforeEach(() => useNetworkStore.setState({ online: true }))

  it('modo lento: avisa quanto falta e o texto fica no campo', async () => {
    await setup(jest.fn().mockResolvedValue({ slowmode: 12 }))
    await type('oi')
    await press()
    expect(await screen.findByText('Modo lento: aguarde 12 s para mandar outra mensagem.')).toBeOnTheScreen()
    expect(screen.getByLabelText('Mensagem para #geral').props.value).toBe('oi')
  })

  it('canal de servidor: digitar "/" sugere os comandos do Maestro e tocar completa', async () => {
    await render(<Composer label="Mensagem para #geral" room="channel:c1" serverId="sv" onSend={jest.fn()} />)
    await type('/pl')
    await fireEvent.press(screen.getByRole('button', { name: '/play <link ou nome>' }))
    expect(screen.getByLabelText('Mensagem para #geral').props.value).toBe('/play ')
  })

  it('DM (sem servidor): não sugere comandos do Maestro', async () => {
    await setup(jest.fn())
    await type('/pl')
    expect(screen.queryByRole('button', { name: '/play <link ou nome>' })).toBeNull()
  })

  const attach = async (label: string) => {
    await fireEvent.press(screen.getByRole('button', { name: 'Anexar arquivo' }))
    await fireEvent.press(await screen.findByRole('button', { name: label }))
  }
  const picked = { uri: 'file:///a.png', name: 'a.png', mimeType: 'image/png', size: 1000 }
  const uploaded = { id: 'att1', kind: 'image', content_type: 'image/png', filename: 'a.png', size_bytes: 1000 }

  it('anexo: escolhe nos arquivos, sobe e envia só com o anexo (sem texto); depois limpa o rascunho', async () => {
    jest.mocked(pickDocuments).mockResolvedValue([picked])
    jest.mocked(uploadAttachment).mockResolvedValue(uploaded as never)
    const onSend = jest.fn().mockResolvedValue('ok')
    await setup(onSend)
    await attach('Arquivos')
    expect(await screen.findByText('a.png')).toBeOnTheScreen()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled())
    await press()
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('', { attachmentIds: ['att1'] }))
    await waitFor(() => expect(screen.queryByText('a.png')).toBeNull())
    expect(uploadAttachment).toHaveBeenCalledWith('channel:c1', picked, expect.any(Object))
  })

  it('anexo subindo: o botão Enviar espera; remover tira o anexo', async () => {
    jest.mocked(pickFromGallery).mockResolvedValue([picked])
    jest.mocked(uploadAttachment).mockImplementation(() => new Promise(() => {}))
    await setup(jest.fn())
    await type('oi')
    await attach('Fotos e vídeos')
    expect(await screen.findByRole('progressbar')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    await fireEvent.press(screen.getByRole('button', { name: 'Remover anexo a.png' }))
    expect(screen.queryByText('a.png')).toBeNull()
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeEnabled()
  })

  it('anexo recusado (tipo) mostra o motivo; câmera cancelada não anexa nada', async () => {
    jest.mocked(pickDocuments).mockResolvedValue([{ ...picked, name: 'x.exe', mimeType: 'application/octet-stream' }])
    await setup(jest.fn())
    await attach('Arquivos')
    expect(await screen.findByText(/não é um tipo aceito/)).toBeOnTheScreen()
    jest.mocked(pickFromCamera).mockResolvedValue([])
    await attach('Câmera')
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('falha no seletor não derruba o campo', async () => {
    jest.mocked(pickDocuments).mockRejectedValue(new Error('indisponível'))
    await setup(jest.fn())
    await attach('Arquivos')
    expect(screen.getByLabelText('Mensagem para #geral')).toBeOnTheScreen()
  })

  const openPicker = () => fireEvent.press(screen.getByRole('button', { name: 'Emojis, GIFs e figurinhas' }))

  it('seletor: emoji entra no texto e fecha o seletor', async () => {
    await setup(jest.fn())
    await openPicker()
    await fireEvent.press(await screen.findByRole('button', { name: 'Joinha' }))
    expect(screen.getByLabelText('Mensagem para #geral').props.value).toBe('👍')
    expect(screen.queryByRole('tablist')).toBeNull()
  })

  it('seletor: escolher um GIF envia na hora com a URL e as medidas', async () => {
    const onSend = jest.fn().mockResolvedValue('ok')
    await setup(onSend)
    await openPicker()
    await fireEvent.press(await screen.findByRole('tab', { name: /GIFs/ }))
    await fireEvent.press(screen.getByRole('button', { name: 'gatinho' }))
    await waitFor(() =>
      expect(onSend).toHaveBeenCalledWith('', { gifUrl: 'https://g/u.gif', gifMetadata: { width: 200, height: 100, preview_url: 'https://g/p.gif' } })
    )
  })

  it('seletor: figurinha do servidor envia o id', async () => {
    const onSend = jest.fn().mockResolvedValue('ok')
    await render(<Composer label="Mensagem para #geral" room="channel:c1" serverId="sv" onSend={onSend} />)
    await openPicker()
    await fireEvent.press(await screen.findByRole('tab', { name: /Figurinhas/ }))
    await fireEvent.press(await screen.findByRole('button', { name: 'oi' }))
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('', { stickerId: 's1' }))
  })

  it('seletor na DM: avisa que figurinhas são dos servidores', async () => {
    await setup(jest.fn())
    await openPicker()
    await fireEvent.press(await screen.findByRole('tab', { name: /Figurinhas/ }))
    expect(screen.getByText('Figurinhas ficam disponíveis em canais de servidores.')).toBeOnTheScreen()
  })

  it('seletor: falha ao enviar o GIF mostra o aviso', async () => {
    await setup(jest.fn().mockResolvedValue('error'))
    await openPicker()
    await fireEvent.press(await screen.findByRole('tab', { name: /GIFs/ }))
    await fireEvent.press(screen.getByRole('button', { name: 'gatinho' }))
    expect(await screen.findByText('Não foi possível enviar. Tente de novo.')).toBeOnTheScreen()
  })

  it('enviar chama onSend com o texto e limpa o campo', async () => {
    const onSend = jest.fn().mockResolvedValue('ok')
    await setup(onSend)
    await type('oi')
    await press()
    await waitFor(() => expect(onSend).toHaveBeenCalledWith('oi', undefined))
    await waitFor(() => expect(screen.getByLabelText('Mensagem para #geral').props.value).toBe(''))
  })

  it('campo vazio: botão desativado', async () => {
    await setup(jest.fn())
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
    await type('   ')
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })

  it('falha: o texto volta ao campo e aparece o aviso', async () => {
    await setup(jest.fn().mockResolvedValue('error'))
    await type('oi')
    await press()
    expect(await screen.findByText('Não foi possível enviar. Tente de novo.')).toBeOnTheScreen()
    expect(screen.getByLabelText('Mensagem para #geral').props.value).toBe('oi')
  })

  it('403: aviso de permissão', async () => {
    await setup(jest.fn().mockResolvedValue('forbidden'))
    await type('oi')
    await press()
    expect(await screen.findByText('Você não tem permissão para enviar mensagens neste canal.')).toBeOnTheScreen()
  })

  it('403 sem texto próprio (DM): cai no aviso genérico de falha', async () => {
    await setup(jest.fn().mockResolvedValue('forbidden'), null)
    await type('oi')
    await press()
    expect(await screen.findByText('Não foi possível enviar. Tente de novo.')).toBeOnTheScreen()
  })

  it('sem rede: botão desativado mesmo com texto', async () => {
    useNetworkStore.setState({ online: false })
    await setup(jest.fn())
    await type('oi')
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  })

  it('durante o envio o botão fica desativado (sem envio duplo)', async () => {
    let finish: (o: SendOutcome) => void = () => {}
    const onSend = jest.fn().mockReturnValue(new Promise((r) => (finish = r)))
    await setup(onSend)
    await type('oi')
    const pressing = press()
    await waitFor(() => expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled())
    finish('ok')
    await pressing
    expect(onSend).toHaveBeenCalledTimes(1)
  })
})
