import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../../shared/api/client'
import { uploadBanner } from './bannerUpload'

const png = { type: 'image/png', size: 1000 } as File

describe('uploadBanner', () => {
  it('arquivo que não serve de banner nem chega a ser enviado', async () => {
    const send = vi.fn()
    const result = await uploadBanner('s1', { type: 'image/gif', size: 10 } as File, send)
    expect(result).toEqual({ ok: false, error: 'Use uma imagem PNG, JPEG ou WEBP.' })
    expect(send).not.toHaveBeenCalled()
  })

  it('envia ao servidor e devolve o id do arquivo', async () => {
    const send = vi.fn().mockResolvedValue('b1')
    expect(await uploadBanner('s1', png, send)).toEqual({ ok: true, bannerId: 'b1' })
    expect(send).toHaveBeenCalledWith('s1', png)
  })

  it('mostra a mensagem do servidor quando o pedido foi recusado', async () => {
    const send = vi.fn().mockRejectedValue(new ApiError(415, 'Só imagens PNG, JPEG ou WEBP.', 'unsupported_image'))
    expect(await uploadBanner('s1', png, send)).toEqual({ ok: false, error: 'Só imagens PNG, JPEG ou WEBP.' })
  })

  it('falha de rede vira a mensagem genérica', async () => {
    const send = vi.fn().mockRejectedValue(new Error('rede caiu'))
    expect(await uploadBanner('s1', png, send)).toEqual({
      ok: false,
      error: 'Não foi possível salvar. Tente de novo.'
    })
  })
})
