import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { emptyForm, type EventFormValues } from '../lib/eventForm'
import RecurrenceFields from './RecurrenceFields'

function render(patch: Partial<EventFormValues>): string {
  const values = { ...emptyForm(new Date(2026, 10, 1, 12, 0)), startsAt: '2026-11-04T20:00', ...patch }
  return renderToStaticMarkup(<RecurrenceFields values={values} onChange={() => {}} />)
}

describe('RecurrenceFields', () => {
  it('oferece as quatro regras de repetição', () => {
    const html = render({})
    for (const label of ['Não repete', 'Todo dia', 'Toda semana', 'Todo mês']) {
      expect(html).toContain(label)
    }
  })

  it('sem repetição, não pergunta quando termina', () => {
    const html = render({ recurrence: 'none' })
    expect(html).not.toContain('Termina')
  })

  it('repetindo, mostra a frase da regra e pergunta quando termina', () => {
    const html = render({ recurrence: 'weekly' })
    expect(html).toContain('Toda quarta-feira')
    expect(html).toContain('Termina')
  })

  it('fim em uma data pede o último dia', () => {
    const html = render({ recurrence: 'weekly', endMode: 'until' })
    expect(html).toContain('Último dia')
    expect(html).toContain('type="date"')
  })

  it('fim por número de vezes pede a quantidade (a partir de 1)', () => {
    const html = render({ recurrence: 'daily', endMode: 'count' })
    expect(html).toContain('Número de vezes')
    expect(html).toContain('type="number"')
    expect(html).toContain('min="1"')
  })

  it('"nunca termina" não mostra campo extra', () => {
    const html = render({ recurrence: 'daily', endMode: 'never' })
    expect(html).not.toContain('Último dia')
    expect(html).not.toContain('Número de vezes')
  })
})
