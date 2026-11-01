import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('./ReactionTooltip', () => ({ default: () => null }))

import ReactionChips from './ReactionChips'

const reactions = [
  { emoji: '🔥', count: 2, user_ids: ['ana', 'bia'] },
  { emoji: '👍', count: 1, user_ids: ['bia'] }
]

function render(canReact = true, pickerAnchor: HTMLElement | null = null): string {
  return renderToStaticMarkup(
    <ReactionChips
      reactions={reactions}
      meId="ana"
      canReact={canReact}
      onReact={() => {}}
      pickerAnchor={pickerAnchor}
      onOpenPicker={() => {}}
    />
  )
}

/** O botão "+" (último botão das pílulas). */
const addButton = (html: string): string => html.split('<button').at(-1) ?? ''

describe('ReactionChips', () => {
  it('sem reações não ocupa espaço', () => {
    const html = renderToStaticMarkup(
      <ReactionChips
        reactions={[]}
        meId="ana"
        canReact
        pickerAnchor={null}
        onReact={() => {}}
        onOpenPicker={() => {}}
      />
    )
    expect(html).toBe('')
  })

  it('pílulas no tamanho do Discord: 28px de altura, emoji de 20px e contagem de 14px', () => {
    const html = render()
    expect(html).toContain('h-7')
    expect(html).toContain('text-ds-lg')
    expect(html).toContain('text-ds-sm')
  })

  it('a minha reação fica destacada (borda e fundo da marca); a dos outros, cinza', () => {
    const html = render()
    const [mine, other] = html.split('<button').slice(1)
    expect(mine).toContain('aria-pressed="true"')
    expect(mine).toContain('border-brand')
    expect(other).toContain('aria-pressed="false"')
    expect(other).toContain('bg-fg/5')
    expect(html).toContain('aria-label="🔥: 2 reações"')
    expect(html).toContain('aria-label="👍: 1 reação"')
  })

  it('botão de adicionar reação no fim, só com permissão', () => {
    expect(render()).toContain('aria-label="Adicionar reação"')
    expect(render(false)).not.toContain('aria-label="Adicionar reação"')
  })

  it('sem permissão, a reação dos outros fica travada (a minha dá para tirar)', () => {
    const [mine, other] = render(false).split('<button').slice(1)
    expect(mine).not.toContain('aria-disabled')
    expect(other).toContain('aria-disabled="true"')
  })

  // Regressão: o "+" só aparecia com o mouse na mensagem; ao levar o mouse para
  // o seletor de emoji aberto por ele, a mensagem perdia o hover e o "+" sumia.
  it('"+" fica oculto até o hover da mensagem quando o seletor está fechado', () => {
    const add = addButton(render())
    expect(add).toContain('[@media(hover:hover)]:opacity-0')
    expect(add).toContain('group-hover:opacity-100')
    expect(add).toContain('aria-expanded="false"')
  })

  it('"+" continua visível enquanto o seletor aberto por ele está aberto', () => {
    const add = addButton(render(true, {} as HTMLElement))
    expect(add).not.toContain('opacity-0')
    expect(add).toContain('opacity-100')
    expect(add).toContain('aria-expanded="true"')
  })
})
