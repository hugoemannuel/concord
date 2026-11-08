import { describe, expect, it } from 'vitest'
import { stripCode } from './stripCode'

describe('stripCode', () => {
  it.each([
    ['oi @ana', 'oi @ana'],
    ['`@ana` oi', '  oi'],
    ['a ``x ` @ana`` b', 'a   b'],
    ['```\n@ana\n``` @bia', '  @bia'],
    ['x\n```js\n@ana```', 'x\n '],
    ['meio ```@ana``` fim', 'meio   fim'],
    ['`sem fim @ana', '`sem fim @ana'],
    ['\\`@ana\\`', '\\`@ana\\`'],
    ['a\\b', 'a\\b']
  ])('%j → %j', (input, expected) => {
    expect(stripCode(input)).toBe(expected)
  })
})
