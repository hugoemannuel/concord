import { describe, expect, it } from 'vitest'
import { adjustmentNotice } from './editorText'

describe('adjustmentNotice', () => {
  it('nada ajustado, nada a dizer', () => {
    expect(adjustmentNotice([])).toBeNull()
  })

  it('um campo', () => {
    expect(adjustmentNotice(['text'])).toBe('Ajustamos o texto para dar para ler.')
  })

  it('vários, em lista com "e"', () => {
    expect(adjustmentNotice(['accent', 'sidebar', 'text'])).toBe(
      'Ajustamos a cor de destaque, a barra lateral e o texto para dar para ler.'
    )
  })
})
