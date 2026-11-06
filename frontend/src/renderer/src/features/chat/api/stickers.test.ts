import { describe, expect, it, vi } from 'vitest'

const uploadTo = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/upload', () => ({ uploadTo }))

import type { UploadForm, UploadOptions } from '../../../shared/api/upload'
import { uploadServerSticker } from './stickers'

describe('uploadServerSticker', () => {
  it('manda o nome aparado e o arquivo (sem nome de arquivo, "sticker.png")', async () => {
    const file = new Blob(['x'])
    uploadTo.mockResolvedValue({ id: 'st1' })
    await expect(uploadServerSticker('s 1', ' gato ', file, 'gato.webp')).resolves.toEqual({ id: 'st1' })
    const [path, form] = uploadTo.mock.calls[0] as [string, UploadForm]
    expect(path).toBe('/servers/s%201/stickers')
    expect(form).toEqual({ fields: { name: 'gato' }, files: [{ field: 'file', blob: file, filename: 'gato.webp' }] })

    await uploadServerSticker('s', 'x', file)
    expect((uploadTo.mock.calls[1][1] as UploadForm).files[0].filename).toBe('sticker.png')
  })

  it('textos de erro do envio de figurinha', async () => {
    await uploadServerSticker('s', 'x', new Blob())
    const { messages } = uploadTo.mock.calls.at(-1)![2] as UploadOptions
    expect(messages!.http!(413, undefined)).toBe('Upload failed: 413')
    expect(messages!.http!(409, 'Nome repetido')).toBe('Nome repetido')
    expect(messages!.network).toBe('Falha de rede ao enviar figurinha')
  })
})
