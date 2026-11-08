import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Attachment } from '../../api/messages'
import FileCard from './FileCard'
import TextFilePreview from './TextFilePreview'
import TextPreviewBody from './TextPreviewBody'
import { ViewerContent } from './TextFileViewer'
import MessageAttachments from '../MessageAttachments'

const file = (over: Partial<Attachment> = {}): Attachment => ({
  id: 'f1',
  kind: 'file',
  content_type: 'application/octet-stream',
  filename: 'relatorio-final-de-2026.pdf',
  size_bytes: 1536,
  ...over
})
const noop = (): void => {}
const lines = (n: number): string => Array.from({ length: n }, (_, i) => `linha ${i + 1}`).join('\n')

describe('FileCard', () => {
  it('nome (trunca, com o nome inteiro na dica), tamanho e o baixar com rótulo e foco', () => {
    const html = renderToStaticMarkup(<FileCard attachment={file()} />)
    expect(html).toContain('title="relatorio-final-de-2026.pdf"')
    expect(html).toContain('truncate')
    expect(html).toContain('1,5 KB')
    expect(html).toMatch(/aria-label="Baixar relatorio-final-de-2026.pdf"[^>]*focus-ring|focus-ring[^>]*aria-label="Baixar relatorio-final-de-2026.pdf"/)
    // Alvo de toque de 44 px e largura total até 432 px.
    expect(html).toContain('size-11')
    expect(html).toContain('max-w-[432px]')
  })
})

describe('TextPreviewBody', () => {
  it('mostra 20 linhas e o "Mostrar mais"; aberto, tudo e o "Mostrar menos"', () => {
    const closed = renderToStaticMarkup(
      <TextPreviewBody filename="a.md" text={lines(25)} expanded={false} onOpen={noop} onToggle={noop} />
    )
    expect(closed).toContain('linha 20')
    expect(closed).not.toContain('linha 21')
    expect(closed).toContain('Mostrar mais')
    const open = renderToStaticMarkup(
      <TextPreviewBody filename="a.md" text={lines(25)} expanded onOpen={noop} onToggle={noop} />
    )
    expect(open).toContain('linha 25')
    expect(open).toContain('Mostrar menos')
  })

  it('texto curto sem botão; a prévia é um botão focável (Enter abre o visualizador)', () => {
    const html = renderToStaticMarkup(
      <TextPreviewBody filename="a.md" text={'# Título\n<b>cru</b>'} expanded={false} onOpen={noop} onToggle={noop} />
    )
    expect(html).not.toContain('Mostrar')
    expect(html).toMatch(/<button type="button" aria-label="a.md"[^>]*focus-ring/)
    // Texto cru: o markdown/HTML não é interpretado.
    expect(html).toContain('&lt;b&gt;cru&lt;/b&gt;')
    expect(html).toContain('font-mono')
  })
})

describe('ViewerContent', () => {
  it('falha, carregando e o texto (com "…" quando passou de 1 MB)', () => {
    expect(renderToStaticMarkup(<ViewerContent text={null} failed truncated={false} />)).toContain(
      'Não foi possível carregar a prévia.'
    )
    expect(renderToStaticMarkup(<ViewerContent text={null} failed={false} truncated={false} />)).toContain(
      'animate-spin'
    )
    expect(renderToStaticMarkup(<ViewerContent text="abc" failed={false} truncated />)).toContain('abc\n…')
    expect(renderToStaticMarkup(<ViewerContent text="abc" failed={false} truncated={false} />)).not.toContain('…')
  })
})

describe('TextFilePreview', () => {
  it('antes de o texto chegar, já mostra o cartão do arquivo', () => {
    const html = renderToStaticMarkup(
      <TextFilePreview attachment={file({ filename: 'notas.md', content_type: 'text/plain; charset=utf-8' })} />
    )
    expect(html).toContain('notas.md')
    expect(html).toContain('Baixar notas.md')
  })
})

describe('MessageAttachments com arquivos', () => {
  it('arquivo não vira player de vídeo: binário é cartão, texto é prévia', () => {
    const html = renderToStaticMarkup(
      <MessageAttachments
        attachments={[
          file(),
          file({ id: 'f2', filename: 'notas.md', content_type: 'text/plain; charset=utf-8' })
        ]}
      />
    )
    expect(html).not.toContain('Reproduzir')
    expect(html).toContain('Baixar relatorio-final-de-2026.pdf')
    expect(html).toContain('Baixar notas.md')
  })
})
