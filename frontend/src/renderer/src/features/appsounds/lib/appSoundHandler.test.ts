import { describe, expect, it, vi } from 'vitest'
import { SOUNDS } from '../../call/lib/sounds'
import { DEFAULT_APP_SOUNDS, type AppSoundSettings, type CustomSounds } from './choice'
import { createAppSoundHandler } from './appSoundHandler'
import { packSound } from './packs'

const FILE = '/api/app-sounds/8f14e45f-ceea-4e7a-9f6b-1f3a2b4c5d6e'

function setup(settings: Partial<AppSoundSettings> = {}, custom: CustomSounds = {}, clipOk = true) {
  const deps = {
    read: () => ({ settings: { ...DEFAULT_APP_SOUNDS, ...settings }, custom }),
    apiBase: '/api',
    playNotes: vi.fn(),
    playClip: vi.fn(() => Promise.resolve(clipOk)),
    stopClip: vi.fn()
  }
  return { deps, handler: createAppSoundHandler(deps) }
}

describe('createAppSoundHandler', () => {
  it('som que não é trocável (nível) fica com o padrão', () => {
    const { handler, deps } = setup()
    expect(handler.play('levelChime')).toBe(false)
    expect(deps.playNotes).not.toHaveBeenCalled()
  })

  it('toca as notas do pacote com o volume escolhido', () => {
    const { handler, deps } = setup({ pack: 'bolhas', volume: 50 })
    expect(handler.play('mute')).toBe(true)
    expect(deps.playNotes).toHaveBeenCalledWith(packSound('bolhas', 'mute'), { gain: 0.5 })
  })

  it('"Sem som": diz que tratou e não toca nada', () => {
    const { handler, deps } = setup({ events: { mute: 'off' } })
    expect(handler.play('mute')).toBe(true)
    expect(deps.playNotes).not.toHaveBeenCalled()
    expect(deps.playClip).not.toHaveBeenCalled()
  })

  it('áudio próprio toca o arquivo; se falhar, o som do pacote', async () => {
    const ok = setup({ events: { knock: 'custom' } }, { knock: FILE })
    ok.handler.play('knock')
    expect(ok.deps.playClip).toHaveBeenCalledWith('knock', FILE, 1)
    await Promise.resolve()
    expect(ok.deps.playNotes).not.toHaveBeenCalled()

    const fail = setup({ events: { knock: 'custom' } }, { knock: FILE }, false)
    fail.handler.play('knock')
    await vi.waitFor(() => expect(fail.deps.playNotes).toHaveBeenCalledWith(SOUNDS.knock, { gain: 1 }))
  })

  it('stop corta o áudio próprio do evento', () => {
    const { handler, deps } = setup()
    handler.stop('ring')
    expect(deps.stopClip).toHaveBeenCalledWith('ring')
  })
})
