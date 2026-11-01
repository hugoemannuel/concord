import { describe, expect, it } from 'vitest'
import {
  fromWindow,
  parseBoolean,
  parseCallState,
  parseNotifyPayload,
  parsePoint,
  parseSourceId
} from './ipcGuard'

describe('ipcGuard', () => {
  const contents = {}
  const win = { webContents: contents }

  it('aceita só mensagens vindas da janela principal', () => {
    expect(fromWindow({ sender: contents }, () => win)).toBe(true)
    expect(fromWindow({ sender: {} }, () => win)).toBe(false)
    expect(fromWindow({ sender: contents }, () => null)).toBe(false)
  })

  it('booleano só se for booleano de verdade', () => {
    expect(parseBoolean(true)).toBe(true)
    expect(parseBoolean(false)).toBe(false)
    expect(parseBoolean('true')).toBeNull()
    expect(parseBoolean(1)).toBeNull()
  })

  it('estado da chamada exige os dois booleanos', () => {
    expect(parseCallState({ inCall: true, muted: false })).toEqual({ inCall: true, muted: false })
    expect(parseCallState({ inCall: 'sim', muted: false })).toBeNull()
    expect(parseCallState(null)).toBeNull()
  })

  it('id de fonte de captura só no formato do desktopCapturer', () => {
    expect(parseSourceId('screen:0:0')).toBe('screen:0:0')
    expect(parseSourceId('window:12345:1')).toBe('window:12345:1')
    expect(parseSourceId('file:///etc/passwd')).toBeNull()
    expect(parseSourceId(42)).toBeNull()
  })

  it('ponto do arraste da janela só com x e y numéricos', () => {
    expect(parsePoint({ x: 2300, y: 100 })).toEqual({ x: 2300, y: 100 })
    // Além da largura do monitor principal (ex.: 1920): não limita, é o ponto todo.
    expect(parsePoint({ x: -4000, y: 0 })).toEqual({ x: -4000, y: 0 })
    expect(parsePoint({ x: '2300', y: 100 })).toBeNull()
    expect(parsePoint({ x: NaN, y: 100 })).toBeNull()
    expect(parsePoint(null)).toBeNull()
  })

  describe('parseNotifyPayload', () => {
    const ok = { title: 'Ana', body: 'oi', route: '/channels/@me/1' }

    it('aceita o aviso do app com as opções booleanas', () => {
      expect(parseNotifyPayload({ ...ok, urgent: true, toast: false })).toEqual({
        ...ok,
        urgent: true,
        toast: false
      })
    })

    it('recusa rota que não é do app e campos com tipo errado', () => {
      expect(parseNotifyPayload({ ...ok, route: 'https://golpe.example' })).toBeNull()
      expect(parseNotifyPayload({ ...ok, route: '//golpe.example' })).toBeNull()
      expect(parseNotifyPayload({ ...ok, title: 7 })).toBeNull()
      expect(parseNotifyPayload({ ...ok, urgent: 'sim' })).toBeNull()
      expect(parseNotifyPayload('x')).toBeNull()
    })

    it('corta título e corpo longos demais', () => {
      const got = parseNotifyPayload({ ...ok, title: 'a'.repeat(500), body: 'b'.repeat(5000) })
      expect(got?.title.length).toBe(200)
      expect(got?.body.length).toBe(1000)
    })
  })
})
