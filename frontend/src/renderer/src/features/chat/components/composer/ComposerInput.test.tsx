import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ComposerInput from './ComposerInput'
import { optionId, type SuggestionMenu } from '../../../../shared/lib/suggestionNav'

const closed: SuggestionMenu = {
  listId: 'sugestoes',
  count: 0,
  highlight: -1,
  step: vi.fn(),
  pickHighlighted: vi.fn(),
  close: vi.fn()
}

const render = (menu: SuggestionMenu): string =>
  renderToStaticMarkup(
    <ComposerInput
      inputRef={{ current: null }}
      value={'linha 1\nlinha 2'}
      placeholder="Conversar em #geral"
      menu={menu}
      replying={false}
      onChange={() => {}}
      onPaste={() => {}}
      onBlur={() => {}}
      onEditLast={() => false}
      onCancelReply={() => {}}
    />
  )

describe('ComposerInput', () => {
  // As teclas (Enter envia, Shift+Enter quebra, Enter com sugestão escolhe) estão
  // em lib/composerKeys.test.ts; aqui, o campo.
  it('é uma área de texto de uma linha que cresce, com o limite de 2000 caracteres', () => {
    const html = render(closed)
    expect(html).toMatch(/^<textarea/)
    expect(html).toContain('rows="1"')
    expect(html).toContain('maxLength="2000"')
    expect(html).toContain('max-h-[50dvh]')
    expect(html).toContain('placeholder="Conversar em #geral"')
    expect(html).toContain('linha 1\nlinha 2</textarea>')
  })

  it('com a lista de sugestões aberta, aponta a lista e o item destacado (leitor de tela)', () => {
    const html = render({ ...closed, count: 3, highlight: 1 })
    expect(html).toContain('aria-autocomplete="list"')
    expect(html).toContain('aria-controls="sugestoes"')
    expect(html).toContain(`aria-activedescendant="${optionId('sugestoes', 1)}"`)
  })

  it('com a lista fechada, não aponta nada', () => {
    const html = render(closed)
    expect(html).not.toContain('aria-controls')
    expect(html).not.toContain('aria-activedescendant')
  })
})
