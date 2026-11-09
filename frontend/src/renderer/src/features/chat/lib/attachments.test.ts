import { describe, expect, it } from 'vitest'
import type { Attachment } from '../api/messages'
import {
  acceptFiles,
  attachmentPreview,
  canCopyImage,
  canSubmit,
  classifyFile,
  draftStatus,
  fitMedia,
  formatBytes,
  formatDuration,
  groupAttachments,
  hasVisualPreview,
  isTextFile,
  mediaFileUrl,
  playableDuration,
  sendErrorMessage,
  uploadErrorMessage
} from './attachments'

const MB = 1024 * 1024

describe('anexos', () => {
  it('classifica pelos tipos aceitos', () => {
    expect(classifyFile({ name: 'a.png', type: 'image/png', size: 10 })).toEqual({
      ok: true,
      kind: 'image'
    })
    expect(classifyFile({ name: 'a.gif', type: 'image/gif', size: 10 })).toEqual({
      ok: true,
      kind: 'image'
    })
    expect(classifyFile({ name: 'v.webm', type: 'video/webm', size: 10 })).toEqual({
      ok: true,
      kind: 'video'
    })
    expect(classifyFile({ name: 'g.webm', type: 'audio/webm;codecs=opus', size: 10 })).toEqual({
      ok: true,
      kind: 'audio'
    })
    expect(classifyFile({ name: 'm.m4a', type: '', size: 10 })).toEqual({ ok: true, kind: 'audio' })
    expect(classifyFile({ name: 'x.mp3', type: 'audio/mpeg', size: 10 })).toEqual({
      ok: true,
      kind: 'audio'
    })
  })
  it('recusa tipo, tamanho e vazio com mensagem clara', () => {
    expect(classifyFile({ name: 'doc.pdf', type: 'application/pdf', size: 10 })).toEqual({
      ok: false,
      error:
        '"doc.pdf" não é um tipo aceito. Envie fotos (png, jpg, webp, gif), vídeos (mp4, webm) ou áudios (mp3, ogg, wav, m4a).'
    })
    expect(classifyFile({ name: 'logo.svg', type: 'image/svg+xml', size: 10 }).ok).toBe(false)
    expect(classifyFile({ name: 'big.mp4', type: 'video/mp4', size: 30 * MB })).toEqual({
      ok: false,
      error: '"big.mp4" tem mais de 25 MB.'
    })
    expect(classifyFile({ name: 'ok.mp4', type: 'video/mp4', size: 25 * MB }).ok).toBe(true)
    expect(classifyFile({ name: 'z.png', type: 'image/png', size: 0 })).toEqual({
      ok: false,
      error: '"z.png" está vazio.'
    })
  })
  it('no chat (any) qualquer arquivo entra; o que não é mídia vira file', () => {
    expect(classifyFile({ name: 'doc.pdf', type: 'application/pdf', size: 10 }, 'any')).toEqual({
      ok: true,
      kind: 'file'
    })
    expect(classifyFile({ name: 'setup.exe', type: '', size: 10 }, 'any')).toEqual({
      ok: true,
      kind: 'file'
    })
    expect(classifyFile({ name: 'a.png', type: 'image/png', size: 10 }, 'any')).toEqual({
      ok: true,
      kind: 'image'
    })
    expect(classifyFile({ name: 'big.zip', type: 'application/zip', size: 30 * MB }, 'any').ok).toBe(
      false
    )
    expect(classifyFile({ name: 'z.md', type: 'text/markdown', size: 0 }, 'any').ok).toBe(false)
    const r = acceptFiles(0, [{ name: 'n.md', type: 'text/markdown', size: 3 }], 'any')
    expect(r.accepted.map((a) => a.kind)).toEqual(['file'])
    expect(acceptFiles(0, [{ name: 'n.md', type: 'text/markdown', size: 3 }]).accepted).toEqual([])
  })
  it('separa mídia, áudio e arquivo; texto pelo tipo do servidor', () => {
    const a = (id: string, kind: Attachment['kind'], type = 'x/y'): Attachment =>
      ({ id, kind, content_type: type }) as Attachment
    const groups = groupAttachments([a('1', 'image'), a('2', 'file'), a('3', 'audio'), a('4', 'video')])
    expect(groups.visual.map((x) => x.id)).toEqual(['1', '4'])
    expect(groups.audios.map((x) => x.id)).toEqual(['3'])
    expect(groups.files.map((x) => x.id)).toEqual(['2'])
    expect(isTextFile(a('5', 'file', 'text/plain; charset=utf-8'))).toBe(true)
    expect(isTextFile(a('6', 'file', 'application/octet-stream'))).toBe(false)
    expect(hasVisualPreview('image')).toBe(true)
    expect(hasVisualPreview('video')).toBe(true)
    expect(hasVisualPreview('audio')).toBe(false)
    expect(hasVisualPreview('file')).toBe(false)
  })
  it('acceptFiles respeita 10 por mensagem', () => {
    const files = Array.from({ length: 4 }, (_, i) => ({
      name: `${i}.png`,
      type: 'image/png',
      size: 1
    }))
    const r = acceptFiles(8, files)
    expect(r.accepted).toHaveLength(2)
    expect(r.errors).toEqual(['Máximo de 10 arquivos por mensagem.'])
  })
  it('fitMedia reserva o espaço mantendo a proporção', () => {
    expect(fitMedia(1920, 1080)).toEqual({ width: 400, height: 225 })
    expect(fitMedia(600, 1200)).toEqual({ width: 150, height: 300 })
    expect(fitMedia(100, 50)).toEqual({ width: 100, height: 50 })
    expect(fitMedia(null, null)).toEqual({ width: 400, height: 225 })
  })
  it('formata tamanho e duração', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1,5 KB')
    expect(formatBytes(25 * MB)).toBe('25 MB')
    expect(formatDuration(7000)).toBe('0:07')
    expect(formatDuration(65_000)).toBe('1:05')
    expect(formatDuration(300_000)).toBe('5:00')
  })
  it('prévia: ícone pelo tipo e o rótulo, sem emoji no texto', () => {
    expect(attachmentPreview([])).toBeNull()
    expect(attachmentPreview(null)).toBeNull()
    expect(attachmentPreview([{ kind: 'image' }])).toEqual({ icon: 'image', text: 'Imagem' })
    expect(attachmentPreview([{ kind: 'video' }])).toEqual({ icon: 'video', text: 'Vídeo' })
    expect(attachmentPreview([{ kind: 'audio' }])).toEqual({ icon: 'audio', text: 'Áudio' })
    expect(attachmentPreview([{ kind: 'file' }])).toEqual({ icon: 'attachment', text: 'Arquivo' })
    expect(attachmentPreview([{ kind: 'image' }, { kind: 'audio' }, { kind: 'image' }])).toEqual({
      icon: 'attachment',
      text: '3 anexos'
    })
  })
  it('mensagens de erro do upload por status', () => {
    expect(uploadErrorMessage(413)).toBe('Arquivo maior que 25 MB.')
    expect(uploadErrorMessage(415)).toBe('Tipo de arquivo não aceito.')
    expect(uploadErrorMessage(507)).toBe('Servidor sem espaço para novos arquivos.')
    expect(uploadErrorMessage(403)).toBe('Você não pode enviar arquivos aqui.')
    expect(uploadErrorMessage(0)).toBe('Falha ao enviar o arquivo.')
  })
  it('URL do arquivo e duração tocável', () => {
    expect(mediaFileUrl('http://h/api', 'a1', 'x.y+z')).toBe('http://h/api/media/a1?token=x.y%2Bz')
    expect(playableDuration(Infinity, 7000)).toBe(7)
    expect(playableDuration(12.5, 7000)).toBe(12.5)
    expect(playableDuration(NaN, null)).toBeNull()
  })
  it('canSubmit espera os uploads', () => {
    const done = { status: 'done' as const, attachment: { id: 'a' } as Attachment }
    expect(canSubmit('', [])).toBe(false)
    expect(canSubmit('oi', [])).toBe(true)
    expect(canSubmit('oi', [], true)).toBe(false) // modo lento: esperando a vez
    expect(canSubmit('', [done])).toBe(true)
    expect(canSubmit('oi', [done, { status: 'uploading' as const }])).toBe(false)
    expect(canSubmit('oi', [{ status: 'error' as const }])).toBe(false)
    expect(draftStatus([done]).readyIds).toEqual(['a'])
  })
  it('erro ao enviar a mensagem com anexo vencido vira texto em português', () => {
    expect(sendErrorMessage(400, 'invalid attachment')).toBe(
      'Um dos arquivos expirou; anexe de novo.'
    )
    expect(sendErrorMessage(400, 'content is required')).toBe('content is required')
    expect(sendErrorMessage(0, '')).toBe('Falha ao enviar mensagem.')
  })
  it('copia PNG, JPEG e WebP; GIF não', () => {
    expect(canCopyImage('image/png')).toBe(true)
    expect(canCopyImage('image/jpeg')).toBe(true)
    expect(canCopyImage('image/webp')).toBe(true)
    expect(canCopyImage('image/gif')).toBe(false)
    expect(canCopyImage('IMAGE/JPEG; charset=binary')).toBe(true)
  })
})
