/**
 * Quando o microfone, a tela e a câmera ficam travados por permissão. O
 * servidor (LiveKit) é quem impede de verdade; aqui só explicamos o motivo e
 * evitamos o botão que não funcionaria.
 */

export interface MicBlockInput {
  /** Pode publicar o microfone (SPEAK no canal e não silenciado no servidor). */
  canSpeak: boolean
  /** Um moderador silenciou a pessoa neste servidor. */
  serverMuted: boolean
}

/** Por que não dá para ligar o microfone (null = pode). */
export function micBlockReason(input: MicBlockInput): string | null {
  if (input.serverMuted) return 'Um moderador silenciou você neste servidor.'
  if (!input.canSpeak) return 'Você não tem permissão para falar neste canal.'
  return null
}

/** Por que não dá para transmitir tela ou câmera (null = pode). */
export function streamBlockReason(canStream: boolean): string | null {
  return canStream ? null : 'Você não tem permissão para transmitir neste canal.'
}

export interface VoiceFlags {
  muted?: boolean
  deafened?: boolean
  serverMuted?: boolean
  serverDeafened?: boolean
}
