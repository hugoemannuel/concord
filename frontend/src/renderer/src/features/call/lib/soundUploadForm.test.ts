import { describe, expect, it, vi } from 'vitest'
import { submitSound, toggleSoundPreview, type SoundSubmitForm } from './soundUploadForm'

const file = new File(['x'], 'corneta.mp3')

function fakeUi(): {
  setSubmitting: ReturnType<typeof vi.fn>
  setError: ReturnType<typeof vi.fn>
  success: ReturnType<typeof vi.fn>
  done: ReturnType<typeof vi.fn>
} {
  return { setSubmitting: vi.fn(), setError: vi.fn(), success: vi.fn(), done: vi.fn() }
}

const form = (over: Partial<SoundSubmitForm> = {}): SoundSubmitForm => ({
  file,
  durationMs: 1500,
  name: '  Corneta ',
  emoji: '🔥',
  submitting: false,
  ...over
})

describe('submitSound', () => {
  it.each([
    ['sem arquivo', { file: null }],
    ['sem duração', { durationMs: null }],
    ['já enviando', { submitting: true }]
  ])('%s: não faz nada', async (_, over) => {
    const ui = fakeUi()
    const upload = vi.fn()
    await submitSound(form(over), upload, ui)
    expect(upload).not.toHaveBeenCalled()
    expect(ui.setError).not.toHaveBeenCalled()
    expect(ui.setSubmitting).not.toHaveBeenCalled()
  })

  it('nome em branco: pede o nome sem enviar', async () => {
    const ui = fakeUi()
    const upload = vi.fn()
    await submitSound(form({ name: '   ' }), upload, ui)
    expect(ui.setError).toHaveBeenCalledWith('Digite um nome para o som.')
    expect(upload).not.toHaveBeenCalled()
  })

  it('envia com nome aparado, avisa e fecha', async () => {
    const ui = fakeUi()
    const upload = vi.fn().mockResolvedValue({})
    await submitSound(form(), upload, ui)
    expect(upload).toHaveBeenCalledWith(file, {
      name: 'Corneta',
      emoji: '🔥',
      duration_ms: 1500,
      filename: 'corneta.mp3'
    })
    expect(ui.setSubmitting.mock.calls).toEqual([[true], [false]])
    expect(ui.setError).toHaveBeenCalledWith(null)
    expect(ui.success).toHaveBeenCalledWith('Som adicionado à mesa de áudio!')
    expect(ui.done).toHaveBeenCalled()
  })

  it('emoji em branco vai como undefined', async () => {
    const upload = vi.fn().mockResolvedValue({})
    await submitSound(form({ emoji: '  ' }), upload, fakeUi())
    expect(upload.mock.calls[0][1].emoji).toBeUndefined()
  })

  it('falha: mostra a mensagem do erro, ou a padrão', async () => {
    const ui = fakeUi()
    await submitSound(form(), vi.fn().mockRejectedValue(new Error('grande demais')), ui)
    expect(ui.setError).toHaveBeenLastCalledWith('grande demais')
    expect(ui.done).not.toHaveBeenCalled()
    expect(ui.setSubmitting).toHaveBeenLastCalledWith(false)

    const other = fakeUi()
    await submitSound(form(), vi.fn().mockRejectedValue('x'), other)
    expect(other.setError).toHaveBeenLastCalledWith('Não foi possível enviar o áudio.')
  })
})

describe('toggleSoundPreview', () => {
  const audio = (play: () => Promise<void> = () => Promise.resolve()): HTMLAudioElement =>
    ({ pause: vi.fn(), play: vi.fn(play), currentTime: 5 }) as unknown as HTMLAudioElement

  it('sem elemento ou sem prévia: nada', () => {
    const set = vi.fn()
    toggleSoundPreview(null, 'blob:x', false, set)
    const el = audio()
    toggleSoundPreview(el, null, false, set)
    expect(el.play).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
  })

  it('tocando: pausa e volta ao início', () => {
    const set = vi.fn()
    const el = audio()
    toggleSoundPreview(el, 'blob:x', true, set)
    expect(el.pause).toHaveBeenCalled()
    expect(el.currentTime).toBe(0)
    expect(set).toHaveBeenCalledWith(false)
  })

  it('parado: toca do início e marca tocando', async () => {
    const set = vi.fn()
    const el = audio()
    toggleSoundPreview(el, 'blob:x', false, set)
    expect(el.currentTime).toBe(0)
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith(true))
  })

  it('o navegador recusa tocar: fica parado', async () => {
    const set = vi.fn()
    toggleSoundPreview(
      audio(() => Promise.reject(new Error('no'))),
      'blob:x',
      false,
      set
    )
    await vi.waitFor(() => expect(set).toHaveBeenCalledWith(false))
  })
})
