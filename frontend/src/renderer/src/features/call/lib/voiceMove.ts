/**
 * Mover pessoas entre canais de voz: precisa de MOVE_MEMBERS no canal em que a
 * pessoa está e cargo mais alto igual ou maior que o do alvo (sem imunidade especial do dono).
 */
export function canMoveVoiceUser(opts: {
  meId: string | undefined
  /** Você tem MOVE_MEMBERS no canal de voz em que a pessoa está. */
  canMoveMembers: boolean
  /** Seu cargo mais alto é >= ao do alvo (ServerAccess.canModerateVoiceMember). */
  canModerateTarget: boolean
}): boolean {
  return Boolean(opts.meId && opts.canMoveMembers && opts.canModerateTarget)
}

/** Em qual canal de voz do servidor a pessoa está conectada (ou null). */
export function voiceChannelOf(
  serverCalls: Record<string, { participants: { user_id: string }[] } | undefined>,
  userId: string
): string | null {
  for (const [channelId, state] of Object.entries(serverCalls)) {
    if (state?.participants.some((p) => p.user_id === userId)) return channelId
  }
  return null
}

/** Tipo usado no arrastar e soltar de pessoas entre canais de voz. */
export const VOICE_USER_DRAG = 'application/x-concord-voice-user'
