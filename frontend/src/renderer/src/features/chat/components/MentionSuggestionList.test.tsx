import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import MentionSuggestionList from './MentionSuggestionList'
import type { MentionSuggestion } from '../lib/mentions'

const render = (suggestions: MentionSuggestion[], highlight = 0): string =>
  renderToStaticMarkup(
    <MentionSuggestionList
      listId="lista"
      suggestions={suggestions}
      highlight={highlight}
      onPick={vi.fn()}
      onHighlight={vi.fn()}
    />
  )

const pessoa: MentionSuggestion = { kind: 'user', username: 'suporte', display_name: 'Suporte' }
const cargo: MentionSuggestion = {
  kind: 'role',
  username: 'suporte',
  id: 'r1',
  name: 'Suporte',
  color: 0x3366ff
}

describe('MentionSuggestionList', () => {
  it('pessoa: o nome de exibição e o @nick', () => {
    const html = render([pessoa])
    expect(html).toContain('Suporte')
    expect(html).toContain('@suporte')
    expect(html).not.toContain('Cargo')
  })

  it('cargo: o nome na cor do cargo, a bolinha e a etiqueta "Cargo"', () => {
    const html = render([cargo])
    expect(html).toContain('>Cargo<')
    expect(html).toContain('color:#3366ff')
    expect(html).toContain('background:#3366ff')
    // O handle não aparece como "@nick": é isso que separa do item da pessoa.
    expect(html).not.toContain('@suporte')
  })

  it('cargo sem cor: sem cor no nome e a bolinha vazia', () => {
    const html = render([{ ...cargo, color: null }])
    expect(html).toContain('background:transparent')
    expect(html).not.toContain('color:#')
  })

  it('conflito de nome: os dois itens na lista, cada um com a própria chave', () => {
    const html = render([pessoa, cargo])
    expect(html.match(/role="option"/g)).toHaveLength(2)
    expect(html).toContain('>Cargo<')
  })

  it('@all/@here/@everyone: o nome e a explicação', () => {
    const html = render([{ kind: 'everyone', username: 'everyone', description: 'Notifica todos do canal' }])
    expect(html).toContain('@everyone')
    expect(html).toContain('Notifica todos do canal')
  })

  it('o nome do cargo trunca e a etiqueta não encolhe (360 px)', () => {
    const html = render([cargo])
    expect(html).toMatch(/class="min-w-0 truncate font-semibold"/)
    expect(html).toMatch(/class="shrink-0 [^"]*">Cargo</)
  })
})
