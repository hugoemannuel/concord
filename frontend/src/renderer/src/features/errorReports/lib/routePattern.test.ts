import { describe, expect, it } from 'vitest'
import { currentRoute, routePattern } from './routePattern'

const UUID = '3f2b8c1e-9a4d-4e7b-8c2a-1b2c3d4e5f60'

describe('routePattern', () => {
  it.each([
    ['raiz', '/', '/'],
    ['vazio', '', '/'],
    ['tela fixa', '/friends', '/friends'],
    ['servidor', `/servers/${UUID}`, '/servers/:id'],
    ['canal', `/servers/${UUID}/channels/${UUID}`, '/servers/:id/channels/:id'],
    ['convite', '/convite/ABCD2345', '/convite/:id'],
    ['visitante', '/visitante/eyJhbGciOi.abc.def', '/visitante/:id'],
    ['DM', `/dm/${UUID}`, '/dm/:id'],
    ['DM em grupo', `/dm/c/${UUID}`, '/dm/c/:id'],
    ['visita', `/visitas/${UUID}`, '/visitas/:id'],
    ['com hífen', '/forgot-password', '/forgot-password'],
    ['sem query nem hash', '/reset-password?token=abc#x', '/reset-password'],
    ['barra no fim', '/friends/', '/friends'],
    ['primeiro segmento que não é nome de tela', `/${UUID}`, '/:id'],
    ['primeiro segmento comprido demais', `/${'a'.repeat(40)}`, '/:id'],
    ['palavra fixa fora do lugar continua literal só se conhecida', '/servers/abc/outra', '/servers/:id/:id']
  ])('%s', (_name, path, want) => {
    expect(routePattern(path)).toBe(want)
  })
})

describe('currentRoute', () => {
  it('desktop lê o hash', () => {
    expect(currentRoute({ pathname: '/C:/app/index.html', hash: `#/servers/${UUID}?x=1` }, true)).toBe('/servers/:id')
  })

  it('desktop sem hash é a raiz', () => {
    expect(currentRoute({ pathname: '/index.html', hash: '' }, true)).toBe('/')
  })

  it('web lê o caminho', () => {
    expect(currentRoute({ pathname: `/dm/c/${UUID}`, hash: '#y' }, false)).toBe('/dm/c/:id')
  })
})
