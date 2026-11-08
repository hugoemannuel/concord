import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { DraftAttachment } from '../lib/attachments'
import ComposerAttachments from './ComposerAttachments'
import { FileIcon } from '../../../shared/ui/icons'

const draft = (over: Partial<DraftAttachment>): DraftAttachment => ({
  localId: 'a',
  file: new File(['x'], 'foto.png'),
  kind: 'image',
  previewUrl: 'blob:x',
  status: 'done',
  progress: 1,
  ...over
})
const noop = (): void => {}

describe('ComposerAttachments', () => {
  it('sem anexos, nada', () => {
    expect(renderToStaticMarkup(<ComposerAttachments drafts={[]} onRemove={noop} />)).toBe('')
  })

  it('imagem, vídeo e áudio com o remover padrão (X desenhado, rótulo e foco)', () => {
    const html = renderToStaticMarkup(
      <ComposerAttachments
        drafts={[
          draft({}),
          draft({ localId: 'b', kind: 'video', status: 'uploading', progress: 0.5 }),
          draft({ localId: 'c', kind: 'audio', previewUrl: null, status: 'error', error: 'Falhou' })
        ]}
        onRemove={noop}
      />
    )
    expect(html).toContain('<img')
    expect(html).toContain('<video')
    expect(html).toContain('width:50%')
    expect(html).toContain('Falhou')
    expect(html.match(/aria-label="Remover anexo"/g)).toHaveLength(3)
    expect(html).not.toContain('×')
    expect(html).toMatch(/aria-label="Remover anexo"[^>]*focus-ring|focus-ring[^>]*aria-label="Remover anexo"/)
  })

  it('arquivo genérico (ex.: message.txt colado) mostra o ícone de arquivo, não o microfone', () => {
    const file = renderToStaticMarkup(
      <ComposerAttachments
        drafts={[draft({ kind: 'file', previewUrl: null, file: new File(['x'], 'message.txt') })]}
        onRemove={noop}
      />
    )
    const fileIcon = renderToStaticMarkup(<FileIcon />).match(/d="([^"]+)"/)![1]
    expect(file).toContain('message.txt')
    expect(file).toContain(fileIcon)
  })
})
