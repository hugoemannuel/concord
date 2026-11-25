import { describe, expect, it } from 'vitest'
import { buildVersion } from './appVersion'

describe('buildVersion', () => {
  it('a do deploy quando vier; senão a do package.json', () => {
    expect(buildVersion(' 0.6.103 ', '0.6.0')).toBe('0.6.103')
    expect(buildVersion(undefined, '0.6.0')).toBe('0.6.0')
    expect(buildVersion('', '0.6.0')).toBe('0.6.0')
  })
})
