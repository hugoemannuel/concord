import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ServerPlugin } from '../api/plugins'
import { PluginPanelBody } from './PluginPanel'

const plugin: ServerPlugin = {
  id: 'a',
  name: 'Placar',
  description: 'd',
  panel_url: 'https://placar.test/painel',
  icon: 'quebra-cabeca',
  author_username: 'mugis',
  status: 'approved',
  enabled: true
}
const noop = (): void => {}

function body(status: 'loading' | 'loaded' | 'failed'): string {
  return renderToStaticMarkup(
    <PluginPanelBody plugin={plugin} state={{ attempt: 0, status }} onLoad={noop} onRetry={noop} />
  )
}

describe('PluginPanelBody', () => {
  it('iframe isolado: sandbox, src, referrerpolicy e sem allow', () => {
    const html = body('loading')
    expect(html).toContain(
      'sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"'
    )
    expect(html).toContain('src="https://placar.test/painel"')
    expect(html).toMatch(/referrerpolicy="no-referrer"/i)
    expect(html).toContain('title="Placar"')
    expect(html).not.toContain(' allow=')
  })

  it('mostra a linha de autoria', () => {
    expect(body('loading')).toContain('Plugin de @mugis · conteúdo de fora da Salinha')
  })

  it('sem falha não mostra o erro', () => {
    expect(body('loading')).not.toContain('Não deu para abrir este plugin agora.')
  })

  it('falhou: mensagem e botão Tentar de novo', () => {
    const html = body('failed')
    expect(html).toContain('Não deu para abrir este plugin agora.')
    expect(html).toContain('Tentar de novo')
  })

  it('falhou: o aviso é anunciado (role="alert")', () => {
    expect(body('failed')).toMatch(/role="alert"[^>]*>\s*<p[^>]*>Não deu para abrir este plugin agora\./)
    expect(body('loading')).not.toContain('role="alert"')
  })
})
