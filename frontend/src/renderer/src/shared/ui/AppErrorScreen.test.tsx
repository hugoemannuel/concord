import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
vi.mock('../../features/call/store/callStore', () => ({ useCallStore: () => undefined }))
import { AppErrorBoundary, AppErrorScreen } from './AppErrorScreen'
import { setErrorSink } from '../lib/errorSink'

afterEach(() => {
  vi.unstubAllGlobals()
  setErrorSink(null)
})

describe('AppErrorScreen', () => {
  it('no desktop mostra Recarregar e Verificar atualização', () => {
    vi.stubGlobal('window', { api: { updates: {} } })
    const html = renderToStaticMarkup(<AppErrorScreen error={new Error('boom')} />)
    expect(html).toContain('Algo deu errado')
    expect(html).toContain('Recarregar')
    expect(html).toContain('Verificar atualização')
    expect(html).toContain('boom')
  })

  it('na web, sem o botão de atualização', () => {
    vi.stubGlobal('window', {})
    const html = renderToStaticMarkup(<AppErrorScreen />)
    expect(html).toContain('Recarregar')
    expect(html).not.toContain('Verificar atualização')
  })

  it('o boundary guarda o erro para mostrar a tela', () => {
    const err = new TypeError("Cannot read properties of undefined (reading 'id')")
    expect(AppErrorBoundary.getDerivedStateFromError(err)).toEqual({ error: err })
    expect(AppErrorBoundary.getDerivedStateFromError(undefined).error).toBeInstanceOf(Error)
  })

  it('o boundary avisa o relatório de erros só com o erro (sem o componentStack)', () => {
    const sink = vi.fn()
    setErrorSink(sink)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const err = new Error('boom')
    new AppErrorBoundary({ children: null }).componentDidCatch(err, { componentStack: '\n    at Tela' })
    expect(sink).toHaveBeenCalledWith(err, 'tela')
    vi.restoreAllMocks()
  })
})
