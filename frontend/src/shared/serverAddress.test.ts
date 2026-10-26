import { describe, expect, it } from 'vitest'
import { normalizeServerAddress, SERVER_ARG, serverUrlFromArgv } from './serverAddress'

describe('normalizeServerAddress', () => {
  it('completa o http:// e fica só com a origem', () => {
    expect(normalizeServerAddress(' 189.1.2.3:8080 ')).toEqual({
      ok: true,
      url: 'http://189.1.2.3:8080'
    })
    expect(normalizeServerAddress('https://salinha.exemplo.com/')).toEqual({
      ok: true,
      url: 'https://salinha.exemplo.com'
    })
    expect(normalizeServerAddress('http://abc.ply.gg:1234/convite/ABCD')).toEqual({
      ok: true,
      url: 'http://abc.ply.gg:1234'
    })
  })

  it('recusa vazio, outros esquemas e credenciais', () => {
    expect(normalizeServerAddress('   ').ok).toBe(false)
    expect(normalizeServerAddress('ftp://x.com').ok).toBe(false)
    expect(normalizeServerAddress('file:///c:/x').ok).toBe(false)
    expect(normalizeServerAddress('http://user:pw@x.com').ok).toBe(false)
    expect(normalizeServerAddress('http://').ok).toBe(false)
  })
})

describe('serverUrlFromArgv', () => {
  it('lê o argumento do main', () => {
    expect(serverUrlFromArgv(['electron', `${SERVER_ARG}http://x:8080`])).toBe('http://x:8080')
  })

  it('sem argumento (ou vazio) não tem servidor', () => {
    expect(serverUrlFromArgv(['electron'])).toBeUndefined()
    expect(serverUrlFromArgv([SERVER_ARG])).toBeUndefined()
  })
})
