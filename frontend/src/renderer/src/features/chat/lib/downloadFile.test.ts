import { describe, expect, it, vi } from 'vitest'
import { downloadAttachment } from './downloadFile'

describe('downloadAttachment', () => {
  it('baixa pelo app (blob) com o nome original: o token nunca vai para fora', async () => {
    const save = vi.fn()
    const fetchFile = vi.fn(async () => new Response('conteúdo', { status: 200 }))
    await downloadAttachment({ id: 'a1', filename: 'relatório.pdf' }, { fetchFile, save })
    expect(fetchFile).toHaveBeenCalledWith('a1')
    expect(save).toHaveBeenCalledOnce()
    const [blob, name] = save.mock.calls[0]
    expect(name).toBe('relatório.pdf')
    expect(await (blob as Blob).text()).toBe('conteúdo')
  })

  it('erro do servidor não salva nada', async () => {
    const save = vi.fn()
    const fetchFile = vi.fn(async () => new Response('', { status: 404 }))
    await expect(downloadAttachment({ id: 'a1', filename: 'x' }, { fetchFile, save })).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
  })
})
