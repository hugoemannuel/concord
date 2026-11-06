import { describe, expect, it, vi } from 'vitest'
import { selectSoundFile } from './soundUpload'

const audio = (name: string, size = 10): File => new File([new Uint8Array(size)], name, { type: 'audio/mpeg' })

function fakeUi(): { setError: ReturnType<typeof vi.fn>; accept: ReturnType<typeof vi.fn>; suggestName: ReturnType<typeof vi.fn> } {
  return { setError: vi.fn(), accept: vi.fn(), suggestName: vi.fn() }
}

describe('selectSoundFile', () => {
  it('sem arquivo: nada muda', async () => {
    const ui = fakeUi()
    const read = vi.fn()
    await selectSoundFile(undefined, '', ui, read)
    expect(ui.setError).not.toHaveBeenCalled()
    expect(read).not.toHaveBeenCalled()
  })

  it('aceita o áudio com a duração e sugere o nome pelo arquivo (até 32 letras)', async () => {
    const ui = fakeUi()
    const file = audio(`${'c'.repeat(40)}.mp3`)
    await selectSoundFile(file, '  ', ui, async () => ({ duration_ms: 1500 }))
    expect(ui.setError).toHaveBeenCalledWith(null)
    expect(ui.accept).toHaveBeenCalledWith(file, 1500)
    expect(ui.suggestName).toHaveBeenCalledWith('c'.repeat(32))
  })

  it('mantém o nome que a pessoa já digitou', async () => {
    const ui = fakeUi()
    await selectSoundFile(audio('x.mp3'), 'Corneta', ui, async () => ({ duration_ms: 100 }))
    expect(ui.accept).toHaveBeenCalled()
    expect(ui.suggestName).not.toHaveBeenCalled()
  })

  it('arquivo acima de 5 MB: erro, sem ler a duração', async () => {
    const ui = fakeUi()
    const read = vi.fn()
    await selectSoundFile(audio('x.mp3', 5 * 1024 * 1024 + 1), '', ui, read)
    expect(ui.setError).toHaveBeenLastCalledWith('O arquivo excede o limite de 5 MB.')
    expect(read).not.toHaveBeenCalled()
    expect(ui.accept).not.toHaveBeenCalled()
  })

  it.each([undefined, 0, NaN, 99, 15_001])('duração %s fora de 0,1s–15s: erro', async (duration_ms) => {
    const ui = fakeUi()
    await selectSoundFile(audio('x.mp3'), '', ui, async () => ({ duration_ms }))
    expect(ui.setError).toHaveBeenLastCalledWith('O áudio precisa ser válido e ter entre 0,1s e 15s de duração.')
    expect(ui.accept).not.toHaveBeenCalled()
  })
})
