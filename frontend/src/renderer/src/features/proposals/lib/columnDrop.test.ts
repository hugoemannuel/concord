import { describe, expect, it } from 'vitest'
import { columnDrop } from './columnDrop'

describe('columnDrop', () => {
  it('sem arrasto: borda comum e a dica da coluna', () => {
    expect(columnDrop(null, 'done', false, 'Já está no app')).toEqual({
      state: 'border-subtle',
      hint: 'Já está no app'
    })
  })
  it('coluna que aceita o card acende; com o mouse em cima, mais forte', () => {
    expect(columnDrop('proposed', 'done', false, 'x').state).toBe('border-violet-400/30')
    expect(columnDrop('proposed', 'done', true, 'x').state).toBe('border-violet-400 bg-violet-500/10')
  })
  it('a coluna de origem fica quieta', () => {
    expect(columnDrop('done', 'done', true, 'x').state).toBe('border-subtle')
  })
  it('Em votação não aceita e avisa; as outras só ficam tracejadas', () => {
    const voting = columnDrop('done', 'voting', true, 'A comunidade decide')
    expect(voting.hint).toBe('A votação não reabre')
    expect(voting.state).toContain('cursor-not-allowed border-dashed border-red-400/70')
    expect(columnDrop('voting', 'voting', false, 'x').state).toBe('border-subtle')
  })
})
