import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ComposerInput from './ComposerInput'
import type { SuggestionMenu } from '../../../../shared/lib/suggestionNav'

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
})
