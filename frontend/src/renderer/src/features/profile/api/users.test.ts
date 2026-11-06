import { describe, expect, it, vi } from 'vitest'

const uploadTo = vi.hoisted(() => vi.fn())
vi.mock('../../../shared/api/upload', () => ({ uploadTo }))

import type { UploadForm, UploadOptions } from '../../../shared/api/upload'
import { uploadImage } from './users'

describe('uploadImage', () => {
  it('manda o arquivo e, se tiver, o quadro parado; avisa o progresso', async () => {
    const file = new Blob(['gif'])
    const still = new Blob(['png'])
    const onProgress = vi.fn()
    uploadTo.mockResolvedValue({ id: 'u1' })
    await expect(uploadImage('/users/me/avatar', 'avatar', file, still, onProgress)).resolves.toEqual({ id: 'u1' })
    const [path, form, opts] = uploadTo.mock.calls[0] as [string, UploadForm, UploadOptions]
    expect(path).toBe('/users/me/avatar')
    expect(form.files).toEqual([
      { field: 'file', blob: file, filename: 'avatar' },
      { field: 'static', blob: still, filename: 'avatar-static' }
    ])
    expect(opts.onProgress).toBe(onProgress)

    await uploadImage('/p', 'icon', file)
    expect((uploadTo.mock.calls[1][1] as UploadForm).files).toHaveLength(1)
  })

  it('textos de erro: os conhecidos por status, senão o do servidor ou o genérico', async () => {
    await uploadImage('/p', 'icon', new Blob())
    const { messages } = uploadTo.mock.calls.at(-1)![2] as UploadOptions
    expect(messages!.http!(413, 'too large')).toBe('A imagem pode ter até 10 MB.')
    expect(messages!.http!(415, undefined)).toBe('Use uma imagem PNG, JPG, GIF ou WebP.')
    expect(messages!.http!(507, undefined)).toBe('O servidor está sem espaço agora. Tente mais tarde.')
    expect(messages!.http!(403, 'Sem permissão')).toBe('Sem permissão')
    expect(messages!.http!(500, undefined)).toBe('Falha no envio')
    expect(messages!.network).toBe('Sem conexão com o servidor.')
  })
})
