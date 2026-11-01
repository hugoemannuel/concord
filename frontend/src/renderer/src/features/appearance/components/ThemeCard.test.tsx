import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { ThemeCard } from './ThemeCard'

const render = (props: Partial<Parameters<typeof ThemeCard>[0]> = {}): string =>
  renderToStaticMarkup(
    <ThemeCard themeKey="forest" label="Floresta" selected={false} onSelect={() => {}} {...props} />
  )

describe('ThemeCard', () => {
  it('radio com a prévia do tema, nome e descrição', () => {
    const html = render({ description: 'Verdes escuros de mata.' })
    expect(html).toContain('type="radio"')
    expect(html).toContain('data-theme="forest"')
    expect(html).toContain('Floresta')
    expect(html).toContain('Verdes escuros de mata.')
    expect(html).not.toContain('checked')
  })

  it('selecionado: marcado e com a borda da marca', () => {
    const html = render({ selected: true })
    expect(html).toContain('checked')
    expect(html).toContain('border-brand')
  })

  it('tema próprio: claro/escuro na prévia e a ação fora do <label>', () => {
    const html = render({ themeKey: 'custom-abc', scheme: 'light', action: <button type="button">Editar</button> })
    expect(html).toContain('data-scheme="light"')
    expect(html).toMatch(/<\/label><div[^>]*><button type="button">Editar<\/button>/)
  })
})
