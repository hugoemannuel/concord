import { describe, expect, it, vi } from 'vitest'
import { pathToFileURL } from 'node:url'
import { applyPermissionPolicy, appOrigins, setupSessionPermissions } from './sessionPermissions'
import type { AppOrigins } from './permissionPolicy'

const APP: AppOrigins = { fileRoot: 'file:///app/out/renderer/', origins: ['https://srv.exemplo'] }
const MAIN = 'file:///app/out/renderer/index.html'

type Fn = (...a: never[]) => unknown

function fakeSession() {
  const h: { request?: Fn; check?: Fn; device?: Fn } = {}
  return {
    h,
    setPermissionRequestHandler: vi.fn((fn: Fn) => (h.request = fn)),
    setPermissionCheckHandler: vi.fn((fn: Fn) => (h.check = fn)),
    setDevicePermissionHandler: vi.fn((fn: Fn) => (h.device = fn))
  }
}

const contents = (url: string) => ({ getURL: () => url })

function request(ses: ReturnType<typeof fakeSession>, permission: string, details: object, top = MAIN) {
  const callback = vi.fn()
  ;(ses.h.request as (...a: unknown[]) => void)(contents(top), permission, callback, details)
  return callback.mock.calls[0][0]
}

function check(
  ses: ReturnType<typeof fakeSession>,
  permission: string,
  origin: string,
  details: object,
  top: string | null = MAIN
) {
  return (ses.h.check as (...a: unknown[]) => boolean)(top ? contents(top) : null, permission, origin, details)
}

describe('applyPermissionPolicy', () => {
  it('pedido do app: microfone sim, localização não', () => {
    const ses = fakeSession()
    applyPermissionPolicy(ses, APP)
    expect(request(ses, 'media', { requestingUrl: MAIN, isMainFrame: true })).toBe(true)
    expect(request(ses, 'geolocation', { requestingUrl: MAIN, isMainFrame: true })).toBe(false)
  })

  it('pedido de página de fora: não', () => {
    const ses = fakeSession()
    applyPermissionPolicy(ses, APP)
    const outside = 'https://evil.example/'
    expect(request(ses, 'media', { requestingUrl: outside, isMainFrame: true }, outside)).toBe(false)
  })

  it('iframe de atividade dentro do app: tela cheia sim', () => {
    const ses = fakeSession()
    applyPermissionPolicy(ses, APP)
    const details = { requestingUrl: 'https://jogo.exemplo/', isMainFrame: false }
    expect(request(ses, 'fullscreen', details)).toBe(true)
    expect(request(ses, 'media', details)).toBe(false)
  })

  it('conferência (permissions.query, rótulos dos dispositivos) usa a URL de quem pergunta', () => {
    const ses = fakeSession()
    applyPermissionPolicy(ses, APP)
    expect(check(ses, 'media', 'file://', { requestingUrl: MAIN, isMainFrame: true })).toBe(true)
    expect(check(ses, 'geolocation', 'file://', { requestingUrl: MAIN, isMainFrame: true })).toBe(false)
    expect(check(ses, 'media', 'https://evil.example', { isMainFrame: true }, null)).toBe(false)
  })

  it('conferência sem URL completa: a página da janela decide se é o app', () => {
    const ses = fakeSession()
    applyPermissionPolicy(ses, APP)
    expect(check(ses, 'media', 'file:///', { isMainFrame: true })).toBe(true)
    expect(check(ses, 'media', 'file:///', { isMainFrame: true }, 'file:///home/x.html')).toBe(false)
    expect(check(ses, 'media', 'https://srv.exemplo', { isMainFrame: true }, null)).toBe(true)
  })

  it('dispositivos USB/HID/serial: sempre negados', () => {
    const ses = fakeSession()
    applyPermissionPolicy(ses, APP)
    expect((ses.h.device as () => boolean)()).toBe(false)
  })
})

describe('setupSessionPermissions', () => {
  it('aplica na sessão padrão e em toda sessão criada depois', () => {
    const listeners: Record<string, Fn> = {}
    const app = { on: vi.fn((ev: string, fn: Fn) => (listeners[ev] = fn)) }
    const def = fakeSession()
    setupSessionPermissions(app, def, APP)
    expect(def.setPermissionRequestHandler).toHaveBeenCalled()
    const later = fakeSession()
    ;(listeners['session-created'] as (s: unknown) => void)(later)
    expect(later.setPermissionCheckHandler).toHaveBeenCalled()
    expect(later.setDevicePermissionHandler).toHaveBeenCalled()
  })
})

describe('appOrigins', () => {
  it('pasta do renderer com barra no fim, origem do dev e dos servidores', () => {
    const got = appOrigins('/app/out/renderer', 'http://localhost:5173/x', [
      'https://srv.exemplo/',
      'https://alt.exemplo:8443/api'
    ])
    expect(got.fileRoot).toBe(pathToFileURL('/app/out/renderer').href + '/')
    expect(got.origins).toEqual(['http://localhost:5173', 'https://srv.exemplo', 'https://alt.exemplo:8443'])
  })

  it('sem dev e com endereço inválido: só o que for http(s) válido', () => {
    const got = appOrigins('/app/out/renderer', undefined, ['lixo', 'ftp://x', 'https://ok.exemplo'])
    expect(got.origins).toEqual(['https://ok.exemplo'])
  })
})
