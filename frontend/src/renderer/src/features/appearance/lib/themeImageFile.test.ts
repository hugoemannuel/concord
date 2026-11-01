import { describe, expect, it } from 'vitest'
import { imageFileProblem, THEME_IMAGE_MAX_FILE } from './themeImageFile'

describe('imageFileProblem', () => {
  it('aceita PNG, JPEG e WEBP dentro do limite', () => {
    expect(imageFileProblem({ type: 'image/png', size: 1000 })).toBeNull()
    expect(imageFileProblem({ type: 'image/webp', size: THEME_IMAGE_MAX_FILE })).toBeNull()
  })
  it('recusa GIF (o fundo não anima), outros tipos e arquivo grande', () => {
    expect(imageFileProblem({ type: 'image/gif', size: 10 })).toMatch(/PNG, JPEG ou WEBP/)
    expect(imageFileProblem({ type: 'application/pdf', size: 10 })).toMatch(/PNG, JPEG ou WEBP/)
    expect(imageFileProblem({ type: 'image/jpeg', size: THEME_IMAGE_MAX_FILE + 1 })).toMatch(/grande demais/)
  })
})
