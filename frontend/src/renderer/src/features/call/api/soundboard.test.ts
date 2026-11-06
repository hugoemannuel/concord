import { describe, expect, it, vi } from 'vitest'

const uploadTo = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/upload', () => ({ uploadTo }))

import type { UploadForm, UploadOptions } from '../../../shared/api/upload'
import { uploadServerSound } from './soundboard'

describe('uploadServerSound', () => {
  it('manda nome e emoji aparados, a duração inteira e o arquivo', async () => {
    const file = new Blob(['x'])
    uploadTo.mockResolvedValueOnce({ id: 's1' })
    await expect(
      uploadServerSound('srv 1', file, { name: ' Corneta ', emoji: ' 🎺 ', duration_ms: 1499.6, filename: 'c.mp3' })
    ).resolves.toEqual({ id: 's1' })
    const [path, form] = uploadTo.mock.calls[0] as [string, UploadForm]
    expect(path).toBe('/servers/srv%201/soundboard')
    expect(form).toEqual({
      fields: { name: 'Corneta', emoji: '🎺', duration_ms: 1500 },
      files: [{ field: 'file', blob: file, filename: 'c.mp3' }]
    })
  })

  it('sem emoji (ou só espaço) e sem nome de arquivo: campo de fora e "sound.mp3"', async () => {
    uploadTo.mockResolvedValueOnce({})
    await uploadServerSound('s', new Blob(), { name: 'x', emoji: '  ', duration_ms: 100 })
    const form = uploadTo.mock.calls.at(-1)![1] as UploadForm
    expect(form.fields!.emoji).toBeUndefined()
    expect(form.files[0].filename).toBe('sound.mp3')
  })

  it('textos de erro do envio de áudio', async () => {
    uploadTo.mockResolvedValueOnce({})
    await uploadServerSound('s', new Blob(), { name: 'x', duration_ms: 100 })
    const { messages } = uploadTo.mock.calls.at(-1)![2] as UploadOptions
    expect(messages!.http!(500, undefined)).toBe('Falha ao enviar áudio')
    expect(messages!.http!(409, 'Nome repetido')).toBe('Nome repetido')
    expect(messages).toMatchObject({ network: 'Erro de rede ao enviar áudio', aborted: 'Envio cancelado' })
  })
})
