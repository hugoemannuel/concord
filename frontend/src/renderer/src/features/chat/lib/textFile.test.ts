import { describe, expect, it, vi } from 'vitest'
import { decodeText, fetchTextHead, previewLines, PREVIEW_BYTES, viewerTruncated } from './textFile'

const bytes = (text: string): ArrayBuffer => new TextEncoder().encode(text).buffer as ArrayBuffer

describe('arquivo de texto', () => {
  it('decodifica UTF-8 sem quebrar numa runa cortada no fim', () => {
    const buffer = bytes('ação')
    // Corta no meio do "ã" (2 bytes): a runa incompleta some, sem caractere de erro.
    expect(decodeText(buffer.slice(0, 2), 16)).toBe('a')
    expect(decodeText(buffer, 16)).toBe('ação')
  })

  it('servidor que ignora o Range (200 com tudo): fica só com o pedaço pedido', () => {
    expect(decodeText(bytes('abcdef'), 3)).toBe('abc')
  })

  it('busca só o começo com Range e decodifica', async () => {
    const fetchFile = vi.fn(async () => new Response(bytes('# Título\nação'), { status: 206 }))
    await expect(fetchTextHead('a1', PREVIEW_BYTES, fetchFile)).resolves.toBe('# Título\nação')
    expect(fetchFile).toHaveBeenCalledWith('a1', { headers: { Range: 'bytes=0-16383' } })
  })

  it('erro do servidor vira falha (a prévia mostra o aviso)', async () => {
    const fetchFile = vi.fn(async () => new Response('', { status: 404 }))
    await expect(fetchTextHead('a1', PREVIEW_BYTES, fetchFile)).rejects.toThrow()
  })

  it('prévia: até 20 linhas; o resto fica para o "Mostrar mais"', () => {
    const text = Array.from({ length: 25 }, (_, i) => `linha ${i + 1}`).join('\n')
    const { head, hasMore } = previewLines(text)
    expect(head.split('\n')).toHaveLength(20)
    expect(hasMore).toBe(true)
    expect(previewLines('curto')).toEqual({ head: 'curto', hasMore: false })
  })

  it('visualizador carrega até 1 MB; acima disso avisa com a linha "…"', () => {
    expect(viewerTruncated(1024 * 1024)).toBe(false)
    expect(viewerTruncated(1024 * 1024 + 1)).toBe(true)
  })
})
