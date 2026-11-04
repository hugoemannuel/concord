import { describe, expect, it } from 'vitest'
import {
  buildConnectSrc,
  buildMediaSrc,
  buildWebConnectSrc,
  buildWebMediaSrc,
  deriveServerUrls,
  fillCsp,
  resolveServerUrls,
  serverCandidates,
  WEB_EXTRA_CSP
} from './serverUrl'

describe('serverCandidates', () => {
  it('põe o principal primeiro e depois os alternativos, só a origem e sem repetir', () => {
    expect(
      serverCandidates(
        'https://74-0-5-252.sslip.io/',
        'https://app-salinha.bhrx.com.br, https://74-0-5-252.sslip.io  https://outro.exemplo/x'
      )
    ).toEqual([
      'https://74-0-5-252.sslip.io',
      'https://app-salinha.bhrx.com.br',
      'https://outro.exemplo'
    ])
  })

  it('ignora endereço inválido ou fora de http(s)', () => {
    expect(serverCandidates('https://a.exemplo', 'nada, ftp://b.exemplo')).toEqual([
      'https://a.exemplo'
    ])
  })

  it('sem principal (dev) não há candidatos: fica o localhost do build', () => {
    expect(serverCandidates(undefined, 'https://app-salinha.bhrx.com.br')).toEqual([])
    expect(serverCandidates('  ', undefined)).toEqual([])
  })
})

describe('deriveServerUrls', () => {
  it('deriva API, WebSocket e LiveKit de um endereço http', () => {
    expect(deriveServerUrls('http://abc.gl.at.ply.gg:12345')).toEqual({
      apiBaseUrl: 'http://abc.gl.at.ply.gg:12345/api',
      wsUrl: 'ws://abc.gl.at.ply.gg:12345/ws',
      liveKitUrl: 'ws://abc.gl.at.ply.gg:12345'
    })
  })

  it('usa wss quando o servidor é https (VPS com TLS)', () => {
    expect(deriveServerUrls('https://concord.exemplo.com.br/')).toEqual({
      apiBaseUrl: 'https://concord.exemplo.com.br/api',
      wsUrl: 'wss://concord.exemplo.com.br/ws',
      liveKitUrl: 'wss://concord.exemplo.com.br'
    })
  })

  it('cai no localhost:8080 quando não há endereço configurado', () => {
    expect(deriveServerUrls(undefined).apiBaseUrl).toBe('http://localhost:8080/api')
    expect(deriveServerUrls('').wsUrl).toBe('ws://localhost:8080/ws')
  })
})

describe('buildConnectSrc', () => {
  it('libera http e ws do servidor configurado', () => {
    expect(buildConnectSrc('http://abc.gl.at.ply.gg:12345')).toBe(
      "'self' http://abc.gl.at.ply.gg:12345 ws://abc.gl.at.ply.gg:12345 https://api.klipy.com"
    )
  })

  it('libera https e wss quando o servidor é https', () => {
    expect(buildConnectSrc('https://concord.exemplo.com.br')).toBe(
      "'self' https://concord.exemplo.com.br wss://concord.exemplo.com.br https://api.klipy.com"
    )
  })

  it('libera também os endereços alternativos (o app pode cair num deles ao abrir)', () => {
    expect(
      buildConnectSrc('https://74-0-5-252.sslip.io', ['https://app-salinha.bhrx.com.br'])
    ).toBe(
      "'self' https://74-0-5-252.sslip.io wss://74-0-5-252.sslip.io https://app-salinha.bhrx.com.br wss://app-salinha.bhrx.com.br https://api.klipy.com"
    )
  })
})

describe('buildMediaSrc', () => {
  it('libera blob e a origem do servidor', () => {
    expect(buildMediaSrc('http://abc.gl.at.ply.gg:12345')).toBe(
      "'self' blob: http://abc.gl.at.ply.gg:12345"
    )
    expect(buildMediaSrc('https://concord.exemplo.com.br/')).toBe(
      "'self' blob: https://concord.exemplo.com.br"
    )
  })
  it('usa o localhost:8080 sem endereço', () => {
    expect(buildMediaSrc(undefined)).toBe("'self' blob: http://localhost:8080")
  })
  it('inclui os endereços alternativos', () => {
    expect(buildMediaSrc('https://a.exemplo', ['https://b.exemplo'])).toBe(
      "'self' blob: https://a.exemplo https://b.exemplo"
    )
  })
})

describe('resolveServerUrls', () => {
  it('no desktop usa o endereço embutido no build, como antes', () => {
    expect(
      resolveServerUrls({
        web: false,
        serverUrl: 'https://concord.exemplo.com.br',
        pageOrigin: 'file://'
      })
    ).toEqual(deriveServerUrls('https://concord.exemplo.com.br'))
  })

  it('no navegador fala com a própria origem: API relativa e wss', () => {
    expect(
      resolveServerUrls({
        web: true,
        serverUrl: 'http://ignorado.exemplo:1234',
        pageOrigin: 'https://app-salinha.bhrx.com.br'
      })
    ).toEqual({
      apiBaseUrl: '/api',
      wsUrl: 'wss://app-salinha.bhrx.com.br/ws',
      liveKitUrl: 'wss://app-salinha.bhrx.com.br'
    })
  })

  it('no navegador em http (dev local) usa ws com a porta da página', () => {
    expect(resolveServerUrls({ web: true, pageOrigin: 'http://localhost:4173' })).toEqual({
      apiBaseUrl: '/api',
      wsUrl: 'ws://localhost:4173/ws',
      liveKitUrl: 'ws://localhost:4173'
    })
  })
})

describe('buildWebConnectSrc', () => {
  it('libera a própria origem, o wss do endereço público e a API de GIFs (KLIPY)', () => {
    expect(buildWebConnectSrc('https://app-salinha.bhrx.com.br/')).toBe(
      "'self' wss://app-salinha.bhrx.com.br https://api.klipy.com"
    )
  })

  it("sem endereço público fica no 'self' (que já cobre o ws da mesma origem) e na KLIPY", () => {
    expect(buildWebConnectSrc(undefined)).toBe("'self' https://api.klipy.com")
    expect(buildWebConnectSrc('  ')).toBe("'self' https://api.klipy.com")
  })
})

describe('buildWebMediaSrc', () => {
  it('mídia do chat vem da própria origem; prévias locais são blob:', () => {
    expect(buildWebMediaSrc()).toBe("'self' blob:")
  })
})

describe('fillCsp', () => {
  const html =
    "<meta content=\"default-src 'self'; img-src 'self' %CONCORD_MEDIA_SRC%; media-src %CONCORD_MEDIA_SRC%; connect-src %CONCORD_CONNECT_SRC%\" />"

  it('preenche connect-src e media-src (desktop: sem diretivas extras)', () => {
    expect(fillCsp(html, { connectSrc: "'self' x", mediaSrc: "'self' blob:" })).toBe(
      "<meta content=\"default-src 'self'; img-src 'self' 'self' blob:; media-src 'self' blob:; connect-src 'self' x\" />"
    )
  })

  it('web: acrescenta as diretivas extras (base-uri e frame-src só dos jogos do catálogo)', () => {
    expect(
      fillCsp(html, { connectSrc: "'self'", mediaSrc: "'self' blob:", extra: WEB_EXTRA_CSP })
    ).toContain("connect-src 'self'; base-uri 'self'; frame-src https://krunker.io\"")
  })
})
