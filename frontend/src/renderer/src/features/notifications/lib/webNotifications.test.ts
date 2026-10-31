import { describe, expect, it } from 'vitest'
import { desktopPayload, DEFAULT_NOTIFICATION_PREFS, type AppNotification } from './notifications'
import {
  browserNotificationOptions,
  permissionView,
  titleWithUnread,
  webNotificationAction
} from './webNotifications'

const message: AppNotification = { kind: 'message', title: 'Ana', body: 'oi', route: '/dm/1' }
const call: AppNotification = {
  kind: 'call',
  title: 'Ana está te ligando',
  body: 'Chamada de voz — clique para atender',
  route: '/dm/1',
  urgent: true
}
const away = { visible: false, focused: false }
const looking = { visible: true, focused: true }

describe('webNotificationAction', () => {
  it('olhando para a aba: nem aviso nem contador (igual ao desktop)', () => {
    const payload = desktopPayload(message, DEFAULT_NOTIFICATION_PREFS)
    expect(webNotificationAction(payload, 'granted', looking)).toEqual({
      show: false,
      countUnread: false
    })
  })

  it('aba em foco mas em outro chat: avisa sem contar no título', () => {
    const payload = desktopPayload(message, DEFAULT_NOTIFICATION_PREFS, { elsewhere: true })
    expect(webNotificationAction(payload, 'granted', looking)).toEqual({
      show: true,
      countUnread: false
    })
    expect(webNotificationAction(payload, 'denied', looking)).toEqual({
      show: false,
      countUnread: false
    })
    const off = desktopPayload(
      message,
      { desktop: false, taskbar: true, sound: true },
      { elsewhere: true }
    )
    expect(webNotificationAction(off, 'granted', looking).show).toBe(false)
  })

  it('aba em segundo plano (ou visível sem foco): avisa e conta a não lida', () => {
    const payload = desktopPayload(message, DEFAULT_NOTIFICATION_PREFS)
    expect(webNotificationAction(payload, 'granted', away)).toEqual({
      show: true,
      countUnread: true
    })
    expect(webNotificationAction(payload, 'granted', { visible: true, focused: false })).toEqual({
      show: true,
      countUnread: true
    })
  })

  it('sem permissão do navegador não mostra o aviso, mas conta no título', () => {
    const payload = desktopPayload(message, DEFAULT_NOTIFICATION_PREFS)
    for (const permission of ['default', 'denied', 'unsupported'] as const) {
      expect(webNotificationAction(payload, permission, away)).toEqual({
        show: false,
        countUnread: true
      })
    }
  })

  it('respeita as preferências de aviso e de contador', () => {
    const payload = desktopPayload(message, { desktop: false, taskbar: false, sound: true })
    expect(webNotificationAction(payload, 'granted', away)).toEqual({
      show: false,
      countUnread: false
    })
  })

  it('chamada recebida sempre avisa e não entra no contador de mensagens', () => {
    const payload = desktopPayload(call, { desktop: false, taskbar: false, sound: false })
    expect(webNotificationAction(payload, 'granted', away)).toEqual({
      show: true,
      countUnread: false
    })
  })
})

describe('titleWithUnread', () => {
  it('mostra as não lidas na frente do título, como (3) Salinha', () => {
    expect(titleWithUnread('Salinha', 3)).toBe('(3) Salinha')
    expect(titleWithUnread('Salinha', 1)).toBe('(1) Salinha')
  })

  it('sem não lidas, só o título', () => {
    expect(titleWithUnread('Salinha', 0)).toBe('Salinha')
    expect(titleWithUnread('Salinha', -2)).toBe('Salinha')
  })
})

describe('permissionView', () => {
  it('ainda não perguntado: oferece o botão de permitir', () => {
    expect(permissionView('default').canRequest).toBe(true)
  })

  it('permitido, bloqueado ou sem suporte: sem botão, com o motivo', () => {
    for (const permission of ['granted', 'denied', 'unsupported'] as const) {
      const view = permissionView(permission)
      expect(view.canRequest).toBe(false)
      expect(view.status).not.toBe('')
    }
    expect(permissionView('denied').status).toMatch(/bloquead/i)
  })
})

describe('browserNotificationOptions', () => {
  it('chamada fica na tela até atender ou fechar; mensagem some sozinha', () => {
    const prefs = DEFAULT_NOTIFICATION_PREFS
    expect(browserNotificationOptions(desktopPayload(call, prefs), 'i.png')).toMatchObject({
      body: call.body,
      icon: 'i.png',
      requireInteraction: true
    })
    expect(browserNotificationOptions(desktopPayload(message, prefs), 'i.png').requireInteraction).toBe(false)
  })

  it('sai sem o som do sistema: quem toca o som escolhido é o app', () => {
    const prefs = DEFAULT_NOTIFICATION_PREFS
    expect(browserNotificationOptions(desktopPayload(message, prefs), 'i.png').silent).toBe(true)
    expect(browserNotificationOptions(desktopPayload(call, prefs), 'i.png').silent).toBe(true)
  })
})
