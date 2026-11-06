import { describe, expect, it } from 'vitest'
import { micBlockReason, streamBlockReason } from './voicePermissions'

describe('micBlockReason', () => {
  it('liberado quando pode falar e não foi silenciado', () => {
    expect(micBlockReason({ canSpeak: true, serverMuted: false })).toBeNull()
  })

  it('silenciado por moderador tem prioridade na explicação', () => {
    expect(micBlockReason({ canSpeak: false, serverMuted: true })).toMatch(/moderador/)
    expect(micBlockReason({ canSpeak: true, serverMuted: true })).toMatch(/moderador/)
  })

  it('sem SPEAK no canal', () => {
    expect(micBlockReason({ canSpeak: false, serverMuted: false })).toMatch(/permissão para falar/)
  })
})

describe('streamBlockReason', () => {
  it('só trava sem permissão', () => {
    expect(streamBlockReason(true)).toBeNull()
    expect(streamBlockReason(false)).toMatch(/permissão para transmitir/)
  })
})
