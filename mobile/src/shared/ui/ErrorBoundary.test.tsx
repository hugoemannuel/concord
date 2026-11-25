import { fireEvent, render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'
import { setErrorSink } from '../lib/errorSink'
import { ErrorBoundary } from './ErrorBoundary'

let shouldThrow = true
function Bomb() {
  if (shouldThrow) throw new Error('boom')
  return <Text>tudo certo</Text>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    jest.restoreAllMocks()
    setErrorSink(null)
  })

  it('erro inesperado: mostra "Tentar de novo" e não derruba o app', async () => {
    shouldThrow = true
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeOnTheScreen()
  })

  it('"Tentar de novo" renderiza os filhos outra vez', async () => {
    shouldThrow = true
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    shouldThrow = false
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }))
    expect(screen.getByText('tudo certo')).toBeOnTheScreen()
  })

  it('erro de renderização vai para o relatório de erros, só o erro (sem pilha de componentes)', async () => {
    shouldThrow = true
    const sink = jest.fn()
    setErrorSink(sink)
    await render(
      <ErrorBoundary>
        <Bomb />
      </ErrorBoundary>
    )
    expect(sink).toHaveBeenCalledTimes(1)
    expect(sink).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }), 'tela')
  })
})
