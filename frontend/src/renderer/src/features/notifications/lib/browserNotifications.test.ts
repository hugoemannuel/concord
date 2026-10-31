import { afterEach, describe, expect, it, vi } from 'vitest'
import { showBrowserNotification } from './browserNotifications'

const payload = { title: 'Ana', body: 'oi', route: '/dm/1', toast: true, taskbar: true }

afterEach(() => vi.unstubAllGlobals())

describe('showBrowserNotification', () => {
  it('mostra o aviso e, no clique, chama onClick e fecha', () => {
    const made: { title: string; options: NotificationOptions; onclick?: () => void; close: () => void }[] = []
    vi.stubGlobal(
      'Notification',
      vi.fn(function (this: (typeof made)[number], title: string, options: NotificationOptions) {
        this.title = title
        this.options = options
        this.close = vi.fn()
        made.push(this)
      })
    )
    const onClick = vi.fn()
    showBrowserNotification(payload, 'i.png', onClick)
    expect(made[0].title).toBe('Ana')
    expect(made[0].options).toMatchObject({ body: 'oi', icon: 'i.png', requireInteraction: false })
    made[0].onclick?.()
    expect(onClick).toHaveBeenCalled()
    expect(made[0].close).toHaveBeenCalled()
  })

  it('navegador que recusa o construtor (só service worker): não quebra', () => {
    vi.stubGlobal(
      'Notification',
      vi.fn(function () {
        throw new TypeError('Illegal constructor')
      })
    )
    expect(() => showBrowserNotification(payload, 'i.png', vi.fn())).not.toThrow()
  })
})
