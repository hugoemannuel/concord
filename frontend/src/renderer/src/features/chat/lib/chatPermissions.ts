import { Perm, has } from '../../servers/lib/permissions'

/** O que o chat de um canal deixa a pessoa fazer (mostra ou esconde os controles). */
export interface ChatPermissions {
  canSend: boolean
  canAttach: boolean
  canReact: boolean
  /** Apagar mensagens de outros e encerrar enquetes (MANAGE_MESSAGES). */
  canModerate: boolean
  canMentionEveryone: boolean
  canReadHistory: boolean
  /** Mandar /tts (SEND_TTS_MESSAGES); na DM vale quem pode escrever. */
  canSendTTS: boolean
  /** Isento do modo lento (MANAGE_MESSAGES ou MANAGE_CHANNELS); DM não tem modo lento. */
  bypassSlowmode: boolean
}

/** DM e grupos: sem cargos, mas com tudo que o chat já fazia. */
export const DIRECT_CHAT_PERMISSIONS: ChatPermissions = {
  canSend: true,
  canAttach: true,
  canReact: true,
  canModerate: false,
  canMentionEveryone: false,
  canReadHistory: true,
  canSendTTS: true,
  bypassSlowmode: true
}

/** A partir das permissões da pessoa no canal (ServerAccess.channelPerms). */
export function chatPermissionsFor(channelPerms: number): ChatPermissions {
  return {
    canSend: has(channelPerms, Perm.SEND_MESSAGES),
    canAttach: has(channelPerms, Perm.SEND_MESSAGES | Perm.ATTACH_FILES),
    canReact: has(channelPerms, Perm.ADD_REACTIONS),
    canModerate: has(channelPerms, Perm.MANAGE_MESSAGES),
    canMentionEveryone: has(channelPerms, Perm.MENTION_EVERYONE),
    canReadHistory: has(channelPerms, Perm.READ_MESSAGE_HISTORY),
    canSendTTS: has(channelPerms, Perm.SEND_MESSAGES | Perm.SEND_TTS_MESSAGES),
    bypassSlowmode:
      has(channelPerms, Perm.MANAGE_MESSAGES) || has(channelPerms, Perm.MANAGE_CHANNELS)
  }
}

/** Aviso no lugar do campo de mensagem (undefined = pode escrever). */
export function sendDeniedReason(p: ChatPermissions): string | undefined {
  return p.canSend ? undefined : 'Você não tem permissão para enviar mensagens neste canal.'
}

export const ATTACH_DENIED = 'Você não tem permissão para enviar arquivos neste canal.'
