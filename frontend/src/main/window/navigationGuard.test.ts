import { describe, expect, it, vi } from 'vitest'
import { guardNavigation, sameDocument } from './navigationGuard'

describe('sameDocument', () => {
  it('aceita a mesma página do app com outra âncora ou busca', () => {
    const app = 'file:///opt/Salinha/resources/app.asar/out/renderer/index.html'
    expect(sameDocument(app, `${app}#/servers/1`)).toBe(true)
    expect(sameDocument('http://localhost:5173/', 'http://localhost:5173/?x=1')).toBe(true)
  })

  it('recusa outra origem, outro arquivo e endereço inválido', () => {
    const app = 'file:///opt/Salinha/out/renderer/index.html'
    expect(sameDocument(app, 'https://golpe.example/')).toBe(false)
    expect(sameDocument(app, 'file:///home/ana/x.html')).toBe(false)
    expect(sameDocument('http://localhost:5173/', 'http://localhost:6000/')).toBe(false)
    expect(sameDocument(app, 'não é url')).toBe(false)
  })
})

type Handler = (event: { preventDefault: () => void }, url: string) => void

describe('guardNavigation', () => {
  function fakeContents(current: string): {
    handlers: Record<string, Handler>
    contents: { getURL: () => string; on: (name: string, cb: Handler) => void }
  } {
    const handlers: Record<string, Handler> = {}
    return {
      handlers,
      contents: {
        getURL: () => current,
        on: (name: string, cb: Handler) => {
          handlers[name] = cb
        }
      }
    }
  }

  it('barra a navegação para fora do app e entrega o link ao navegador', () => {
    const { handlers, contents } = fakeContents('file:///app/index.html')
    const openOutside = vi.fn()
    guardNavigation(contents, openOutside)
    const event = { preventDefault: vi.fn() }

    handlers['will-navigate'](event, 'https://site.example/')

    expect(event.preventDefault).toHaveBeenCalled()
    expect(openOutside).toHaveBeenCalledWith('https://site.example/')
  })

  it('redirecionamento para fora é só barrado', () => {
    const { handlers, contents } = fakeContents('file:///app/index.html')
    const openOutside = vi.fn()
    guardNavigation(contents, openOutside)
    const event = { preventDefault: vi.fn() }

    handlers['will-redirect'](event, 'https://site.example/')

    expect(event.preventDefault).toHaveBeenCalled()
    expect(openOutside).not.toHaveBeenCalled()
  })

  it('deixa passar a própria página do app', () => {
    const { handlers, contents } = fakeContents('file:///app/index.html')
    guardNavigation(contents, vi.fn())
    const event = { preventDefault: vi.fn() }

    handlers['will-navigate'](event, 'file:///app/index.html#/x')

    expect(event.preventDefault).not.toHaveBeenCalled()
  })
})
