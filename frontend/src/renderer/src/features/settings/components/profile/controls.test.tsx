import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { HeartIcon } from '../../../../shared/ui/icons'
import { ChipGroup } from './controls'

const render = (options: Parameters<typeof ChipGroup>[0]['options']): string =>
  renderToStaticMarkup(<ChipGroup label="Teste" options={options} value="a" onPick={() => {}} />)

describe('ChipGroup', () => {
  it('chip com ícone: o SVG do conjunto em 16 px antes do rótulo', () => {
    const html = render([{ id: 'a', label: 'Corações', icon: HeartIcon }])
    expect(html).toMatch(
      /<svg[^>]* width="16" height="16"[^>]*>[\s\S]*<\/svg><span[^>]*>Corações<\/span>/
    )
  })

  it('só o ícone: o rótulo vira o nome acessível', () => {
    const html = render([{ id: 'a', label: 'Corações', icon: HeartIcon, iconOnly: true }])
    expect(html).toContain('aria-label="Corações"')
    expect(html).not.toContain('>Corações<')
  })

  it('sem ícone: só o rótulo', () => {
    expect(render([{ id: 'a', label: 'Nenhuma' }])).not.toContain('<svg')
  })

  it('rótulo longo quebra linha em vez de cortar, e pode vir com estilo próprio', () => {
    const html = render([{ id: 'a', label: 'Branco e vermelho', labelStyle: { fontFamily: "'Bitter', serif" } }])
    expect(html).not.toContain('truncate')
    expect(html).toContain('break-words')
    expect(html).toContain('font-family:&#x27;Bitter&#x27;, serif')
  })
})
