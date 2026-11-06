import { describe, expect, it, vi } from 'vitest'
import { pickStickerFile, submitSticker } from './stickerUpload'

const image = (name: string, type: string, size = 10): File =>
  new File([new Uint8Array(size)], name, { type })

describe('pickStickerFile', () => {
  it('sem arquivo: nada muda', () => {
    expect(pickStickerFile(undefined, 'gato')).toBeNull()
  })

  it('aceita PNG, WebP e GIF e sugere o nome pelo arquivo (até 32 letras)', () => {
    const file = image('Gato Feliz.png', 'image/png')
    expect(pickStickerFile(file, '')).toEqual({ error: null, file, name: 'Gato Feliz' })
    const longo = image(`${'a'.repeat(40)}.webp`, 'image/webp')
    expect(pickStickerFile(longo, '')!.name).toBe('a'.repeat(32))
    expect(pickStickerFile(image('x.gif', 'image/gif'), '')!.file).not.toBeNull()
  })

  it('mantém o nome que a pessoa já digitou', () => {
    expect(pickStickerFile(image('x.png', 'image/png'), 'risada')!.name).toBe('risada')
  })

  it('recusa arquivo grande ou de outro formato, sem trocar o escolhido', () => {
    expect(pickStickerFile(image('x.png', 'image/png', 1024 * 1024 + 1), 'n')).toEqual({
      error: 'A imagem deve ter no máximo 1 MB.',
      file: null,
      name: 'n'
    })
    expect(pickStickerFile(image('x.jpg', 'image/jpeg'), 'n')).toEqual({
      error: 'Apenas imagens PNG, WebP ou GIF são suportadas.',
      file: null,
      name: 'n'
    })
  })
})

describe('submitSticker', () => {
  const file = image('gato.png', 'image/png')
  const fakeUi = (): Record<'setSubmitting' | 'setError' | 'success' | 'done', ReturnType<typeof vi.fn>> => ({
    setSubmitting: vi.fn(),
    setError: vi.fn(),
    success: vi.fn(),
    done: vi.fn()
  })

  it.each([
    ['sem imagem', null, 'gato', 'Selecione uma imagem para a figurinha.'],
    ['sem nome', file, '   ', 'Dê um nome para a figurinha.'],
    ['nome longo', file, 'a'.repeat(33), 'O nome pode ter no máximo 32 caracteres.']
  ])('%s: explica e não envia', async (_, picked, name, message) => {
    const ui = fakeUi()
    const upload = vi.fn()
    await submitSticker(picked, name, upload, ui)
    expect(ui.setError).toHaveBeenCalledWith(message)
    expect(upload).not.toHaveBeenCalled()
    expect(ui.setSubmitting).not.toHaveBeenCalled()
  })

  it('envia com o nome aparado, avisa e fecha', async () => {
    const ui = fakeUi()
    const upload = vi.fn().mockResolvedValue({})
    await submitSticker(file, ' gato ', upload, ui)
    expect(upload).toHaveBeenCalledWith('gato', file, 'gato.png')
    expect(ui.setSubmitting.mock.calls).toEqual([[true], [false]])
    expect(ui.setError).toHaveBeenCalledWith(null)
    expect(ui.success).toHaveBeenCalledWith('Figurinha adicionada com sucesso!')
    expect(ui.done).toHaveBeenCalled()
  })

  it('falha: mostra a mensagem do erro, ou a padrão', async () => {
    const ui = fakeUi()
    await submitSticker(file, 'gato', vi.fn().mockRejectedValue(new Error('cheio')), ui)
    expect(ui.setError).toHaveBeenLastCalledWith('cheio')
    expect(ui.done).not.toHaveBeenCalled()
    expect(ui.setSubmitting).toHaveBeenLastCalledWith(false)

    const other = fakeUi()
    await submitSticker(file, 'gato', vi.fn().mockRejectedValue('x'), other)
    expect(other.setError).toHaveBeenLastCalledWith('Não foi possível enviar a figurinha.')
  })
})
