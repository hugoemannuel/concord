import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ChannelViewOnceField from './ChannelViewOnceField'

describe('ChannelViewOnceField', () => {
  it('mostra o interruptor com rótulo, estado e descrição', () => {
    const html = renderToStaticMarkup(<ChannelViewOnceField value={true} onChange={() => {}} />)
    expect(html).toContain('>Visualização única<')
    expect(html).toContain('role="switch"')
    expect(html).toContain('aria-checked="true"')
    expect(html).toContain('aria-label="Visualização única"')
    expect(html).toContain(
      'Membros podem mandar fotos e vídeos que cada pessoa abre uma vez. Nem a moderação consegue abrir.'
    )
  })

  it('desligado', () => {
    const html = renderToStaticMarkup(<ChannelViewOnceField value={false} onChange={() => {}} />)
    expect(html).toContain('aria-checked="false"')
  })
})
