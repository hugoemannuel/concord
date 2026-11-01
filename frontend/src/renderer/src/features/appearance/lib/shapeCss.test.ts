import { describe, expect, it } from 'vitest'
import { shapeCss } from './shapeCss'

const NORMAL = { radius: 100, density: 'normal', font: 'outfit' } as const

describe('shapeCss', () => {
  it('o padrão não muda nada', () => {
    expect(shapeCss(NORMAL)).toEqual({ always: [], finePointer: [] })
  })

  it('cantos escalam o raio do Tailwind', () => {
    const { always } = shapeCss({ ...NORMAL, radius: 0 })
    expect(always).toContain('--radius-lg: 0rem;')
    expect(shapeCss({ ...NORMAL, radius: 200 }).always).toContain('--radius-xl: 1.5rem;')
  })

  it('compacto só com mouse; confortável sempre', () => {
    expect(shapeCss({ ...NORMAL, density: 'compact' })).toEqual({ always: [], finePointer: ['--spacing: 0.225rem;'] })
    expect(shapeCss({ ...NORMAL, density: 'comfortable' }).always).toEqual(['--spacing: 0.275rem;'])
  })

  it('fonte da interface', () => {
    expect(shapeCss({ ...NORMAL, font: 'mono' }).always).toEqual(['--font-sans: var(--font-mono);'])
    expect(shapeCss({ ...NORMAL, font: 'system' }).always[0]).toMatch(/^--font-sans: system-ui/)
  })
})
