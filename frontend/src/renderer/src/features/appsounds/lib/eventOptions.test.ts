import { describe, expect, it } from 'vitest'
import { eventOptions, volumeLabel } from './eventOptions'

describe('eventOptions', () => {
  it('começa por "do pacote" com o nome dele e termina em "Sem som"', () => {
    const options = eventOptions('cristal', false)
    expect(options[0]).toEqual({ value: 'pack', label: 'Do pacote (Cristal)' })
    expect(options.at(-1)).toEqual({ value: 'off', label: 'Sem som' })
    expect(options.some((o) => o.value === 'custom')).toBe(false)
  })

  it('"Meu áudio" só aparece quando há um áudio enviado', () => {
    expect(eventOptions('salinha', true).map((o) => o.value)).toContain('custom')
  })
})

describe('volumeLabel', () => {
  it('mostra em porcentagem', () => {
    expect(volumeLabel(120)).toBe('120%')
  })
})
