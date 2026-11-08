import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import LinkEmbed from './LinkEmbed'

const buser = {
  url: 'https://www.buser.com.br/',
  site_name: 'Buser',
  title: 'Passagens de ônibus',
  description: 'Viaje pagando menos.',
  image_id: '11111111-1111-1111-1111-111111111111',
  color: '#e0218a'
}

describe('LinkEmbed', () => {
  it('mostra site, título em link para fora, descrição, imagem e a faixa colorida', () => {
    const html = renderToStaticMarkup(<LinkEmbed preview={buser} />)
    expect(html).toContain('Buser')
    expect(html).toContain('href="https://www.buser.com.br/"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('Viaje pagando menos.')
    expect(html).toContain('/link-previews/image/11111111-1111-1111-1111-111111111111')
    expect(html).toContain('border-left-color:#e0218a')
  })

  it('o X de remover só aparece para quem pode remover (o autor)', () => {
    expect(renderToStaticMarkup(<LinkEmbed preview={buser} />)).not.toContain('Remover prévias')
    expect(renderToStaticMarkup(<LinkEmbed preview={buser} onRemove={() => {}} />)).toContain(
      'aria-label="Remover prévias"'
    )
  })

  it('cor fora de #rgb/#rrggbb não vai para o style', () => {
    const html = renderToStaticMarkup(<LinkEmbed preview={{ ...buser, color: 'red;background:url(x)' }} />)
    expect(html).not.toContain('border-left-color')
  })

  it('YouTube: miniatura com play, sem iframe até o clique', () => {
    const html = renderToStaticMarkup(
      <LinkEmbed preview={{ ...buser, url: 'https://youtu.be/dQw4w9WgXcQ', youtube_id: 'dQw4w9WgXcQ' }} />
    )
    expect(html).toContain('aria-label="Reproduzir vídeo"')
    expect(html).not.toContain('<iframe')
  })
})
