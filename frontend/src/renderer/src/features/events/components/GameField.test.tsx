import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { GAME_OPTIONS, NO_GAME, OTHER_GAME } from '../lib/eventGame'
import GameField from './GameField'

function render(choice: string, custom = '', disabled = false): string {
  return renderToStaticMarkup(
    <GameField choice={choice} custom={custom} disabled={disabled} onChange={() => {}} />
  )
}

/** A tag do campo com esse nome. */
function tag(html: string, name: string): string {
  const match = new RegExp(`<(?:input|select)[^>]*name="${name}"[^>]*>`).exec(html)
  if (!match) throw new Error(`sem campo ${name}`)
  return match[0]
}

describe('GameField', () => {
  it('oferece "Nenhum jogo", os jogos do catálogo e "Outro jogo…"', () => {
    const html = render(NO_GAME)
    expect(html).toContain('Jogo (opcional)')
    expect(html).toContain('Nenhum jogo')
    expect(html).toContain('Outro jogo…')
    for (const option of GAME_OPTIONS) expect(html).toContain(`>${option.label}</option>`)
  })

  it('marca a opção escolhida', () => {
    expect(render('Minecraft')).toMatch(/<option[^>]*value="Minecraft"[^>]*selected[^>]*>/)
    expect(render(NO_GAME)).toMatch(/<option[^>]*value=""[^>]*selected[^>]*>Nenhum jogo/)
  })

  it('o campo de texto só aparece em "Outro jogo…", com limite de 64 e o nome digitado', () => {
    expect(render('Minecraft')).not.toContain('Nome do jogo')
    expect(render(NO_GAME)).not.toContain('Nome do jogo')
    const html = render(OTHER_GAME, 'Xadrez')
    expect(html).toContain('Nome do jogo')
    expect(tag(html, 'event-game-custom')).toContain('maxLength="64"')
    expect(tag(html, 'event-game-custom')).toContain('value="Xadrez"')
  })

  it('travado, trava o seletor e o campo de texto', () => {
    const html = render(OTHER_GAME, 'Xadrez', true)
    expect(tag(html, 'event-game')).toContain('disabled=""')
    expect(tag(html, 'event-game-custom')).toContain('disabled=""')
    const free = render(OTHER_GAME, 'Xadrez')
    expect(tag(free, 'event-game')).not.toContain('disabled=""')
  })
})
