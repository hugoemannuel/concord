import { describe, expect, it } from 'vitest'
import { DIRECT_CHAT_PERMISSIONS, chatPermissionsFor, sendDeniedReason } from './chatPermissions'
import { ALL_PERMISSIONS, DEFAULT_EVERYONE, Perm } from '../../servers/lib/permissions'

describe('chatPermissionsFor', () => {
  it('membro comum escreve, anexa e reage, mas não modera nem marca todos', () => {
    expect(chatPermissionsFor(DEFAULT_EVERYONE)).toEqual({
      canSend: true,
      canAttach: true,
      canReact: true,
      canModerate: false,
      canMentionEveryone: false,
      canReadHistory: true,
      canSendTTS: true,
      bypassSlowmode: false
    })
  })

  it('/tts pede SEND_TTS_MESSAGES e SEND_MESSAGES', () => {
    expect(chatPermissionsFor(DEFAULT_EVERYONE & ~Perm.SEND_TTS_MESSAGES).canSendTTS).toBe(false)
    expect(chatPermissionsFor(DEFAULT_EVERYONE & ~Perm.SEND_MESSAGES).canSendTTS).toBe(false)
    expect(DIRECT_CHAT_PERMISSIONS.canSendTTS).toBe(true)
  })

  it('quem tem tudo pode tudo', () => {
    const p = chatPermissionsFor(ALL_PERMISSIONS)
    expect(Object.values(p).every(Boolean)).toBe(true)
  })

  it('sem SEND_MESSAGES não escreve nem anexa', () => {
    const p = chatPermissionsFor(DEFAULT_EVERYONE & ~Perm.SEND_MESSAGES)
    expect(p.canSend).toBe(false)
    expect(p.canAttach).toBe(false)
    expect(p.canReact).toBe(true)
  })

  it('anexar pede SEND_MESSAGES e ATTACH_FILES', () => {
    expect(chatPermissionsFor(DEFAULT_EVERYONE & ~Perm.ATTACH_FILES).canAttach).toBe(false)
  })

  it('sem ADD_REACTIONS não reage', () => {
    expect(chatPermissionsFor(DEFAULT_EVERYONE & ~Perm.ADD_REACTIONS).canReact).toBe(false)
  })

  it('MANAGE_MESSAGES modera; sem READ_MESSAGE_HISTORY não lê o histórico', () => {
    expect(chatPermissionsFor(DEFAULT_EVERYONE | Perm.MANAGE_MESSAGES).canModerate).toBe(true)
    expect(chatPermissionsFor(DEFAULT_EVERYONE & ~Perm.READ_MESSAGE_HISTORY).canReadHistory).toBe(
      false
    )
  })

  it('Gerenciar mensagens ou Gerenciar canais isenta do modo lento', () => {
    expect(chatPermissionsFor(DEFAULT_EVERYONE | Perm.MANAGE_MESSAGES).bypassSlowmode).toBe(true)
    expect(chatPermissionsFor(DEFAULT_EVERYONE | Perm.MANAGE_CHANNELS).bypassSlowmode).toBe(true)
    expect(DIRECT_CHAT_PERMISSIONS.bypassSlowmode).toBe(true)
  })

  it('sem ver o canal (0) nada é permitido', () => {
    expect(Object.values(chatPermissionsFor(0)).some(Boolean)).toBe(false)
  })
})

describe('sendDeniedReason / DM', () => {
  it('só avisa quando não pode escrever', () => {
    expect(sendDeniedReason(chatPermissionsFor(DEFAULT_EVERYONE))).toBeUndefined()
    expect(sendDeniedReason(chatPermissionsFor(0))).toMatch(/permissão para enviar mensagens/)
  })

  it('DM mantém o que o chat já fazia', () => {
    expect(DIRECT_CHAT_PERMISSIONS.canSend).toBe(true)
    expect(DIRECT_CHAT_PERMISSIONS.canAttach).toBe(true)
    expect(DIRECT_CHAT_PERMISSIONS.canModerate).toBe(false)
  })
})
