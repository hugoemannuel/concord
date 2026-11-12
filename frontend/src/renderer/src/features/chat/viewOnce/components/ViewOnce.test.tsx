import { describe, expect, it, vi } from 'vitest'

vi.mock('react-dom', async (original) => ({
  ...(await original<typeof import('react-dom')>()),
  createPortal: (node: React.ReactNode) => node
}))

vi.mock('../../../call/store/callStore', () => ({
  useCallStore: (sel: (s: { isScreenSharing: boolean }) => unknown) => sel({ isScreenSharing: false })
}))

import { renderToStaticMarkup } from 'react-dom/server'
import type { ViewOnceMedia } from '../../api/messages'
import ViewOncePill from './ViewOncePill'
import { ViewerStage, ViewOnceConfirm } from './ViewOnceViewer'

const media = (o: Partial<ViewOnceMedia> = {}): ViewOnceMedia => ({
  id: 'a',
  kind: 'image',
  gone: false,
  viewer_ids: [],
  recipient_count: 1,
  ...o
})

describe('ViewOncePill', () => {
  it('não visto: botão com o rótulo', () => {
    const html = renderToStaticMarkup(
      <ViewOncePill state="unseen" media={media({ kind: 'video' })} onOpen={() => {}} />
    )
    expect(html).toContain('<button')
    expect(html).toContain('Vídeo')
  })

  it('aberta e expirou: só texto, sem botão', () => {
    for (const [state, text] of [
      ['seen', 'Aberta'],
      ['expired', 'Expirou']
    ] as const) {
      const html = renderToStaticMarkup(
        <ViewOncePill state={state} media={media()} onOpen={() => {}} />
      )
      expect(html).not.toContain('<button')
      expect(html).toContain(text)
    }
  })
})

describe('ViewerStage', () => {
  it('vídeo sem baixar, sem picture-in-picture e sem menu', () => {
    vi.stubGlobal('document', { body: {} })
    const html = renderToStaticMarkup(<ViewerStage kind="video" src="/x" onClose={() => {}} />)
    expect(html).toContain('controlsList="nodownload noplaybackrate"')
    expect(html).toContain('disablePictureInPicture')
    expect(html).toContain('object-contain')
    expect(html).toMatch(/fixed.*inset-0/)
  })

  it('foto não arrastável', () => {
    vi.stubGlobal('document', { body: {} })
    const html = renderToStaticMarkup(<ViewerStage kind="image" src="/x" onClose={() => {}} />)
    expect(html).toContain('draggable="false"')
  })
})

describe('ViewOnceConfirm', () => {
  const render = (kind: 'image' | 'video'): string => {
    vi.stubGlobal('document', { body: {} })
    return renderToStaticMarkup(
      <ViewOnceConfirm open kind={kind} loading={false} onConfirm={() => {}} onCancel={() => {}} />
    )
  }

  it('foto: texto aprovado e botões Ver / Cancelar', () => {
    const html = render('image')
    expect(html).toContain('Esta foto só pode ser vista uma vez. Ao fechar, ela some.')
    expect(html).toContain('Ver')
    expect(html).toContain('Cancelar')
  })

  it('vídeo: variante do texto', () => {
    expect(render('video')).toContain('Este vídeo só pode ser visto uma vez. Ao fechar, ele some.')
  })
})
