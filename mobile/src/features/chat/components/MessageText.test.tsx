import { fireEvent, render, screen } from '@testing-library/react-native'
import { Alert } from 'react-native'
import { requestEmojiOrigin, resetEmojiOrigins, useEmojiOrigins } from '../store/emojiOrigins'
import { MessageText, originText } from './MessageText'

jest.mock('../store/mediaToken', () => ({ ensureMediaToken: jest.fn().mockResolvedValue('tk') }))
jest.mock('../store/emojiOrigins', () => {
  const actual = jest.requireActual('../store/emojiOrigins')
  return { ...actual, requestEmojiOrigin: jest.fn() }
})

const ID = '3f2b6c1e-8a4d-4f7e-9b1a-2c3d4e5f6a7b'
const content = `oi <:festa:${ID}>`

beforeEach(() => {
  resetEmojiOrigins()
  jest.mocked(requestEmojiOrigin).mockClear()
})

describe('MessageText', () => {
  it('nunca mostra o token cru: enquanto não sabe, fica o :nome:', async () => {
    await render(<MessageText content={content} />)
    expect(screen.getByText(/:festa:/)).toBeOnTheScreen()
    expect(screen.queryByText(new RegExp(ID))).toBeNull()
    expect(requestEmojiOrigin).toHaveBeenCalledWith(ID)
  })

  it('recebido de outro servidor aparece como imagem', async () => {
    useEmojiOrigins.setState({ byId: { [ID]: { id: ID, name: 'festa', origin: { server_name: 'Alfa' } } } })
    await render(<MessageText content={content} />)
    expect(await screen.findByRole('button', { name: ':festa:' })).toBeOnTheScreen()
  })

  it('apagado na origem fica o :nome:', async () => {
    useEmojiOrigins.setState({ byId: { [ID]: { id: ID, name: 'festa', deleted: true } } })
    await render(<MessageText content={content} />)
    expect(screen.getByText(/:festa:/)).toBeOnTheScreen()
  })

  it('sem acesso fica o :nome:', async () => {
    useEmojiOrigins.setState({ byId: { [ID]: null } })
    await render(<MessageText content={content} />)
    expect(screen.getByText(/:festa:/)).toBeOnTheScreen()
  })

  it('tocar diz de que servidor veio', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {})
    useEmojiOrigins.setState({ byId: { [ID]: { id: ID, name: 'festa', origin: { server_name: 'Alfa' } } } })
    await render(<MessageText content={content} />)
    await fireEvent.press(await screen.findByRole('button', { name: ':festa:' }))
    expect(alert).toHaveBeenCalledWith(':festa:', 'de Alfa')
  })

  it('texto comum não pergunta nada', async () => {
    await render(<MessageText content="só texto" />)
    expect(screen.getByText('só texto')).toBeOnTheScreen()
    expect(requestEmojiOrigin).not.toHaveBeenCalled()
  })
})

describe('originText', () => {
  it('servidor privado não tem nome', () => {
    expect(originText({ private: true, server_name: 'Segredo' })).toBe('de um servidor privado')
  })

  it('mostra o nome do servidor', () => {
    expect(originText({ server_name: 'Alfa' })).toBe('de Alfa')
  })

  it('sem origem não inventa', () => {
    expect(originText(undefined)).toBe('de outro servidor')
  })
})
