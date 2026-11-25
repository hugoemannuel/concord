import { describe, expect, it } from 'vitest'
import { createSleepLog } from './sleepLog'

describe('createSleepLog', () => {
  it('o PC dormiu: quanto tempo, na hora em que acordou; leva uma vez só', () => {
    const log = createSleepLog(() => 10_000)
    log.note(312_400)
    expect(log.take()).toEqual([{ type: 'pc_dormiu', detail: '312 s', at: 10_000 }])
    expect(log.take()).toEqual([])
  })
  it('guarda no máximo as 5 últimas', () => {
    let t = 0
    const log = createSleepLog(() => t++)
    for (let i = 0; i < 7; i++) log.note(1000)
    expect(log.take().map((e) => e.at)).toEqual([2, 3, 4, 5, 6])
  })
})
