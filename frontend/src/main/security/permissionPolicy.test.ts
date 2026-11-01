import { describe, expect, it } from 'vitest'
import { isAppUrl, permissionAllowed, type AppOrigins } from './permissionPolicy'

const APP: AppOrigins = {
  fileRoot: 'file:///opt/Salinha/resources/app.asar/out/renderer/',
  origins: ['http://localhost:5173', 'https://app-salinha.exemplo.com']
}
const MAIN = 'file:///opt/Salinha/resources/app.asar/out/renderer/index.html#/canal/1'

describe('isAppUrl', () => {
  it('o renderer empacotado (qualquer página da pasta dele)', () => {
    expect(isAppUrl(MAIN, APP)).toBe(true)
    expect(isAppUrl('file:///opt/Salinha/resources/app.asar/out/renderer/overlay.html', APP)).toBe(true)
  })

  it('outro arquivo local não é o app', () => {
    expect(isAppUrl('file:///home/ana/Downloads/pagina.html', APP)).toBe(false)
    expect(isAppUrl('file:///opt/Salinha/resources/app.asar/out/renderer-falso/x.html', APP)).toBe(false)
  })

  it('não escapa da pasta com ../ nem com %2e%2e', () => {
    expect(isAppUrl('file:///opt/Salinha/resources/app.asar/out/renderer/../../x.html', APP)).toBe(false)
    expect(isAppUrl('file:///opt/Salinha/resources/app.asar/out/renderer/%2e%2e/x.html', APP)).toBe(false)
  })

  it('o servidor de dev e o servidor configurado, pela origem exata', () => {
    expect(isAppUrl('http://localhost:5173/', APP)).toBe(true)
    expect(isAppUrl('https://app-salinha.exemplo.com/convite/abc', APP)).toBe(true)
    expect(isAppUrl('https://app-salinha.exemplo.com.evil.io/', APP)).toBe(false)
    expect(isAppUrl('http://app-salinha.exemplo.com/', APP)).toBe(false)
    expect(isAppUrl('http://localhost:5174/', APP)).toBe(false)
  })

  it('vazio, inválido ou sem pasta do renderer: não é o app', () => {
    expect(isAppUrl(undefined, APP)).toBe(false)
    expect(isAppUrl('', APP)).toBe(false)
    expect(isAppUrl('nada disso', APP)).toBe(false)
    expect(isAppUrl(MAIN, { fileRoot: null, origins: [] })).toBe(false)
  })
})

describe('permissionAllowed', () => {
  const fromApp = { requestingUrl: MAIN, isMainFrame: true }

  it.each([
    'media',
    'display-capture',
    'notifications',
    'clipboard-sanitized-write',
    'fullscreen',
    'speaker-selection'
  ])('o app pode pedir %s', (permission) => {
    expect(permissionAllowed(permission, fromApp, APP)).toBe(true)
  })

  it.each([
    'geolocation',
    'clipboard-read',
    'midi',
    'midiSysex',
    'hid',
    'serial',
    'usb',
    'idle-detection',
    'openExternal',
    'window-management',
    'keyboardLock',
    'pointerLock',
    'mediaKeySystem',
    'storage-access',
    'unknown'
  ])('nem o app recebe %s (não usa)', (permission) => {
    expect(permissionAllowed(permission, fromApp, APP)).toBe(false)
  })

  it('página de fora não recebe nada, nem microfone', () => {
    const outside = { requestingUrl: 'https://evil.example/', isMainFrame: true }
    expect(permissionAllowed('media', outside, APP)).toBe(false)
    expect(permissionAllowed('notifications', outside, APP)).toBe(false)
  })

  it('iframe de atividade dentro do app: só tela cheia e pointer lock (o allow= do iframe decide o resto)', () => {
    const embed = {
      requestingUrl: 'https://jogo.exemplo/sala',
      embeddingUrl: MAIN,
      isMainFrame: false
    }
    expect(permissionAllowed('fullscreen', embed, APP)).toBe(true)
    expect(permissionAllowed('pointerLock', embed, APP)).toBe(true)
    expect(permissionAllowed('media', embed, APP)).toBe(false)
    expect(permissionAllowed('notifications', embed, APP)).toBe(false)
  })

  it('iframe dentro de página de fora: nada', () => {
    const embed = {
      requestingUrl: 'https://jogo.exemplo/sala',
      embeddingUrl: 'https://evil.example/',
      isMainFrame: false
    }
    expect(permissionAllowed('fullscreen', embed, APP)).toBe(false)
  })

  it('quadro principal de fora fingindo estar embutido: nada', () => {
    const fake = { requestingUrl: 'https://jogo.exemplo/', embeddingUrl: MAIN, isMainFrame: true }
    expect(permissionAllowed('fullscreen', fake, APP)).toBe(false)
  })
})
