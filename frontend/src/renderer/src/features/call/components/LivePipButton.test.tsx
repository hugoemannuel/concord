import { beforeEach, describe, expect, it, vi } from 'vitest'

const supported = vi.hoisted(() => ({ value: true }))
vi.mock('../lib/livePipBrowser', () => ({
  livePipSupported: () => supported.value,
  toggleLivePip: vi.fn()
}))

import { renderToStaticMarkup } from 'react-dom/server'
import { useLivePipStore } from '../store/livePipStore'
import LivePipButton, { PipToggle } from './LivePipButton'

describe('LivePipButton', () => {
  beforeEach(() => {
    supported.value = true
    useLivePipStore.getState().setUserId(null)
  })

  it('oferece abrir a live na janela flutuante', () => {
    const html = renderToStaticMarkup(<LivePipButton userId="bia" />)
    expect(html).toContain('aria-label="Janela flutuante"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('com a live na janela: pressionado, oferece sair', () => {
    const html = renderToStaticMarkup(<PipToggle active onToggle={() => {}} />)
    expect(html).toContain('aria-label="Sair da janela flutuante"')
    expect(html).toContain('aria-pressed="true"')
  })

  it('navegador sem PiP (Firefox): sem botão', () => {
    supported.value = false
    expect(renderToStaticMarkup(<LivePipButton userId="bia" />)).toBe('')
  })
})

describe('PipToggle: visibilidade', () => {
  it('só aparece com o mouse no tile, como a barra de volume', () => {
    const html = renderToStaticMarkup(<PipToggle active={false} onToggle={() => {}} />)
    expect(html).toContain('group-hover/tile:opacity-100')
  })
})
