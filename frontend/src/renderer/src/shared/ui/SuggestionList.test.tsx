import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import SuggestionList from './SuggestionList'
import { optionId } from '../lib/suggestionNav'

const noop = (): void => {}

const render = (items: string[], highlight: number): string =>
  renderToStaticMarkup(
    <SuggestionList
      id="cmd"
      label="Comandos"
      items={items}
      highlight={highlight}
      itemKey={(item) => item}
      onPick={noop}
      onHighlight={noop}
      className="absolute bottom-full"
    >
      {(item) => <span>{item}</span>}
    </SuggestionList>
  )

describe('SuggestionList', () => {
  it('é um listbox com nome e uma opção por item, cada uma com o id que o campo aponta', () => {
    const out = render(['/play', '/skip'], -1)
    expect(out).toContain('role="listbox"')
    expect(out).toContain('id="cmd"')
    expect(out).toContain('aria-label="Comandos"')
    expect(out.match(/role="option"/g)).toHaveLength(2)
    expect(out).toContain(`id="${optionId('cmd', 0)}"`)
    expect(out).toContain(`id="${optionId('cmd', 1)}"`)
    expect(out).toContain('<span>/skip</span>')
    expect(out).toContain('absolute bottom-full')
  })

  it('só o item destacado fica selecionado', () => {
    const out = render(['/play', '/skip'], 1)
    expect(out.match(/aria-selected="true"/g)).toHaveLength(1)
    expect(out).toMatch(new RegExp(`id="${optionId('cmd', 1)}"[^>]*aria-selected="true"`))
  })

  it('sem itens, não desenha nada', () => {
    expect(render([], -1)).toBe('')
  })
})
