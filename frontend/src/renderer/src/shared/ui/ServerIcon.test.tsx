import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ServerIcon from './ServerIcon'

const render = (el: React.JSX.Element): string => renderToStaticMarkup(el)

describe('ServerIcon', () => {
  it('sem ícone: a inicial em maiúscula, escondida do leitor de tela, no fundo padrão', () => {
    const html = render(<ServerIcon name="brothers" />)
    expect(html).toMatch(/^<span class="[^"]*"><span aria-hidden="true">B<\/span><\/span>$/)
    for (const cls of ['size-8', 'text-ds-xs', 'rounded-md', 'bg-fg/10', 'font-semibold', 'text-normal', 'overflow-hidden']) {
      expect(html).toContain(cls)
    }
  })

  it('com ícone: a imagem cobre a caixa e o fundo da inicial não aparece atrás dela', () => {
    const html = render(<ServerIcon name="Brothers" iconUrl="https://x/y.gif" />)
    expect(html).toMatch(/<img src="https:\/\/x\/y.gif" alt="" class="[^"]*h-full w-full object-cover/)
    expect(html).not.toContain('bg-fg/10')
    expect(html).not.toContain('>B<')
  })

  it('tamanho, raio e texto pela escala; a classe extra vale para os dois estados', () => {
    const html = render(<ServerIcon name="a" size="xl" shape="xl" text="sm" className="bg-surface" fallbackClassName="" />)
    for (const cls of ['size-16', 'rounded-xl', 'text-ds-sm', 'bg-surface']) expect(html).toContain(cls)
    expect(html).not.toContain('text-ds-lg')
    const img = render(<ServerIcon name="a" iconUrl="https://x/y.png" shape="full" className="bg-surface" />)
    expect(img).toContain('rounded-full')
    expect(img).toContain('bg-surface')
  })

  it('tamanho em pixels vira largura e altura', () => {
    const html = render(<ServerIcon name="a" size={48} style={{ fontSize: 19 }} />)
    expect(html).toContain('width:48px;height:48px;font-size:19px')
    expect(html).not.toContain('size-')
  })

  it('preso (trilho): a imagem não arrasta e nada pega o ponteiro', () => {
    const html = render(<ServerIcon name="a" iconUrl="https://x/y.png" pinned />)
    expect(html).toContain('draggable="false"')
    expect(html).toContain('pointer-events-none select-none')
    expect(render(<ServerIcon name="a" pinned />)).toContain('pointer-events-none select-none')
  })

  it('lazy: a imagem carrega e decodifica sem travar a lista', () => {
    const html = render(<ServerIcon name="a" iconUrl="https://x/y.png" lazy />)
    expect(html).toContain('loading="lazy"')
    expect(html).toContain('decoding="async"')
  })
})
