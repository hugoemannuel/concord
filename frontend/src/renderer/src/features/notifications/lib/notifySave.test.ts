import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_NOTIFY_SETTINGS } from './notificationMute'
import { saveNotifySettings, type NotifySaveDeps } from './notifySave'

const next = { ...DEFAULT_NOTIFY_SETTINGS, level: 'mentions' as const }
const deps = (fail?: unknown): NotifySaveDeps => {
  const run = vi.fn(async () => (fail === undefined ? undefined : Promise.reject(fail)))
  return { saveServer: run, saveChannel: run, error: vi.fn() }
}

describe('saveNotifySettings', () => {
  it('sem canal: salva a opção do servidor', async () => {
    const d = deps()
    await saveNotifySettings(d, 's1', undefined, next)
    expect(d.saveServer).toHaveBeenCalledWith('s1', next)
    expect(d.error).not.toHaveBeenCalled()
  })

  it('com canal: salva a do canal', async () => {
    const d = { ...deps(), saveServer: vi.fn() }
    await saveNotifySettings(d, 's1', 'c1', next)
    expect(d.saveChannel).toHaveBeenCalledWith('s1', 'c1', next)
    expect(d.saveServer).not.toHaveBeenCalled()
  })

  it('falhou: avisa com a mensagem do erro ou o padrão', async () => {
    const d = deps(new Error('offline'))
    await saveNotifySettings(d, 's1', undefined, next)
    expect(d.error).toHaveBeenCalledWith('offline')
    const d2 = deps('x')
    await saveNotifySettings(d2, 's1', 'c1', next)
    expect(d2.error).toHaveBeenCalledWith('Não foi possível salvar as notificações.')
  })
})
