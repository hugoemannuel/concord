import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ComposerInput from './ComposerInput'
import type { MentionMenu } from '../../hooks/useMentionMenu'

const menu: MentionMenu = {
  open: false,
  suggestions: [],
  highlight: -1,
  onInput: vi.fn(),
  pick: vi.fn(),
  step: vi.fn(),
  setHighlight: vi.fn(),
  close: vi.fn(),
  reset: vi.fn()
}

describe('ComposerInput', () => {
  // As teclas (Enter envia, Shift+Enter quebra, Enter com menção escolhe) estão
  // em lib/composerKeys.test.ts; aqui, o campo.
  it('é uma área de texto de uma linha que cresce, com o limite de 2000 caracteres', () => {
    const html = renderToStaticMarkup(
      <ComposerInput
        inputRef={{ current: null }}
        value={'linha 1\nlinha 2'}
        placeholder="Conversar em #geral"
        menu={menu}
        replying={false}
        onChange={() => {}}
        onPaste={() => {}}
        onEditLast={() => false}
        onCancelReply={() => {}}
      />
    )
    expect(html).toMatch(/^<textarea/)
    expect(html).toContain('rows="1"')
    expect(html).toContain('maxLength="2000"')
    expect(html).toContain('max-h-[50dvh]')
    expect(html).toContain('placeholder="Conversar em #geral"')
    expect(html).toContain('linha 1\nlinha 2</textarea>')
  })
})
