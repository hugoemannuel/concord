import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ReminderPicker from './ReminderPicker'

/** Pega a tag <input> de uma opção pelo texto do rótulo. */
function checkbox(html: string, label: string): string {
  const match = new RegExp(`<input[^>]*type="checkbox"[^>]*>(?=[^<]*${label})`).exec(html)
  if (!match) throw new Error(`sem opção "${label}" em: ${html}`)
  return match[0]
}

describe('ReminderPicker', () => {
  it('oferece as seis antecedências como caixas de marcar', () => {
    const html = renderToStaticMarkup(<ReminderPicker selected={[10, 5]} onChange={() => {}} />)
    expect(html.match(/type="checkbox"/g)).toHaveLength(6)
    expect(html).toContain('1 dia antes')
    expect(html).toContain('5 minutos antes')
  })

  it('com duas marcadas, as outras ficam travadas e as marcadas continuam livres', () => {
    const html = renderToStaticMarkup(<ReminderPicker selected={[10, 5]} onChange={() => {}} />)
    expect(checkbox(html, '10 minutos antes')).toContain('checked')
    expect(checkbox(html, '10 minutos antes')).not.toContain('disabled')
    expect(checkbox(html, '30 minutos antes')).toContain('disabled')
    expect(checkbox(html, '1 dia antes')).toContain('disabled')
  })

  it('com vaga, nenhuma opção fica travada', () => {
    const html = renderToStaticMarkup(<ReminderPicker selected={[10]} onChange={() => {}} />)
    expect(html).not.toContain('disabled')
  })

  it('explica o limite e o aviso que sempre sai', () => {
    const html = renderToStaticMarkup(<ReminderPicker selected={[]} onChange={() => {}} />)
    expect(html).toContain('Avisar antes (até 2)')
    expect(html).toContain('O aviso na hora de começar sempre é enviado.')
  })
})
