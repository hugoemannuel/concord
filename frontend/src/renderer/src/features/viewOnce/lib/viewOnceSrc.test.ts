import { describe, expect, it } from 'vitest'
import { API_BASE_URL } from '../../../shared/lib/config'
import { mediaFileUrl } from '../../chat/lib/attachments'
import { viewOnceSrc } from './viewOnceSrc'

describe('viewOnceSrc', () => {
  it('monta a mesma URL de mídia, com o token da abertura', () => {
    expect(viewOnceSrc('a1', 't k')).toBe(mediaFileUrl(API_BASE_URL, 'a1', 't k'))
    expect(viewOnceSrc('a1', 't k')).toBe(`${API_BASE_URL}/media/a1?token=t%20k`)
  })
})
