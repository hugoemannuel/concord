import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ChannelCreationOptions } from './ChannelCreateMenu'

describe('menu do botão de criar canais', () => {
  it('oferece criar categoria no mesmo menu do canal', () => {
    const html = renderToStaticMarkup(<ChannelCreationOptions channelLabel="Criar canal de texto" onChannel={vi.fn()} onCategory={vi.fn()} />)
    expect(html).toContain('Criar canal de texto')
    expect(html).toContain('Criar categoria')
  })
})
