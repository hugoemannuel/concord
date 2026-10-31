/**
 * Catálogo das permissões para as telas (rótulo e descrição em pt-BR, grupos
 * do editor de cargos e do editor de sobrescritas de canal).
 */
import type { ChannelKind, PermName } from './permissions'

export interface PermissionInfo {
  name: PermName
  label: string
  description: string
  /** Só faz sentido em canais de texto / de voz (as sobrescritas do canal filtram por isso). */
  scope?: 'text' | 'voice'
}

export interface PermissionGroup {
  title: string
  permissions: PermissionInfo[]
}

export const PERMISSION_GROUPS: PermissionGroup[] = [
  {
    title: 'Administrador',
    permissions: [
      {
        name: 'ADMINISTRATOR',
        label: 'Administrador',
        description:
          'Membros com essa permissão têm todas as permissões e ignoram restrições de canais. Esta é uma permissão perigosa.'
      }
    ]
  },
  {
    title: 'Geral',
    permissions: [
      {
        name: 'VIEW_CHANNEL',
        label: 'Ver canais',
        description: 'Permite ver os canais. Sem isso o canal nem aparece.'
      },
      {
        name: 'MANAGE_CHANNELS',
        label: 'Gerenciar canais',
        description: 'Criar, editar, reordenar e apagar canais.'
      },
      {
        name: 'MANAGE_ROLES',
        label: 'Gerenciar cargos',
        description: 'Criar e editar cargos abaixo do seu e dar ou tirar cargos dos membros.'
      },
      {
        name: 'MANAGE_SERVER',
        label: 'Gerenciar servidor',
        description: 'Mudar nome, ícone e canal principal do servidor.'
      },
      {
        name: 'VIEW_AUDIT_LOG',
        label: 'Ver registro de auditoria',
        description:
          'Ver quem fez cada ação de moderação e administração neste servidor e o que mudou.'
      },
      {
        name: 'CREATE_INVITE',
        label: 'Criar convite',
        description: 'Convidar amigos e compartilhar o código do servidor.'
      },
      {
        name: 'MANAGE_EXPRESSIONS',
        label: 'Gerenciar mesa de áudio',
        description: 'Apagar os áudios que outras pessoas enviaram.'
      },
      {
        name: 'ADD_SOUNDS',
        label: 'Adicionar sons',
        description: 'Enviar sons novos para a mesa de áudio deste servidor.'
      },
      {
        name: 'ADD_STICKERS',
        label: 'Adicionar figurinhas',
        description: 'Enviar figurinhas novas para este servidor.'
      },
      {
        name: 'ADD_EMOJIS',
        label: 'Adicionar emojis',
        description: 'Enviar emojis novos para este servidor.'
      }
    ]
  },
  {
    title: 'Membros',
    permissions: [
      {
        name: 'KICK_MEMBERS',
        label: 'Expulsar membros',
        description: 'Tirar membros do servidor (eles podem voltar por convite).'
      },
      {
        name: 'BAN_MEMBERS',
        label: 'Banir membros',
        description: 'Banir membros: eles não voltam até serem desbanidos.'
      },
      {
        name: 'CHANGE_NICKNAME',
        label: 'Alterar apelido',
        description: 'Mudar o próprio apelido neste servidor.'
      },
      {
        name: 'MANAGE_NICKNAMES',
        label: 'Gerenciar apelidos',
        description: 'Mudar o apelido de quem está abaixo do seu cargo.'
      }
    ]
  },
  {
    title: 'Canais de texto',
    permissions: [
      {
        name: 'SEND_MESSAGES',
        label: 'Enviar mensagens',
        description: 'Escrever nos canais de texto.',
        scope: 'text'
      },
      {
        name: 'ATTACH_FILES',
        label: 'Enviar arquivos',
        description: 'Anexar imagens e arquivos às mensagens.',
        scope: 'text'
      },
      {
        name: 'ADD_REACTIONS',
        label: 'Adicionar reações',
        description: 'Reagir às mensagens com emojis.',
        scope: 'text'
      },
      {
        name: 'MENTION_EVERYONE',
        label: 'Mencionar @all e @here',
        description: 'Avisar todo mundo do canal de uma vez.',
        scope: 'text'
      },
      {
        name: 'SEND_TTS_MESSAGES',
        label: 'Enviar mensagens TTS',
        description: 'Usar /tts: a mensagem é lida em voz para quem está em call.',
        scope: 'text'
      },
      {
        name: 'MANAGE_MESSAGES',
        label: 'Gerenciar mensagens',
        description: 'Apagar mensagens de outras pessoas e encerrar enquetes.',
        scope: 'text'
      },
      {
        name: 'READ_MESSAGE_HISTORY',
        label: 'Ver histórico',
        description: 'Ler as mensagens antigas do canal.',
        scope: 'text'
      }
    ]
  },
  {
    title: 'Canais de voz',
    permissions: [
      {
        name: 'CONNECT',
        label: 'Conectar',
        description: 'Entrar nos canais de voz.',
        scope: 'voice'
      },
      { name: 'SPEAK', label: 'Falar', description: 'Falar nos canais de voz.', scope: 'voice' },
      {
        name: 'STREAM',
        label: 'Transmitir',
        description: 'Compartilhar a tela e a câmera.',
        scope: 'voice'
      },
      {
        name: 'USE_SOUNDBOARD',
        label: 'Usar mesa de áudio',
        description: 'Tocar os sons da mesa de áudio na chamada.',
        scope: 'voice'
      },
      {
        name: 'MUTE_MEMBERS',
        label: 'Silenciar membros',
        description: 'Silenciar outras pessoas no servidor.',
        scope: 'voice'
      },
      {
        name: 'DEAFEN_MEMBERS',
        label: 'Ensurdecer membros',
        description: 'Ensurdecer outras pessoas no servidor.',
        scope: 'voice'
      },
      {
        name: 'MOVE_MEMBERS',
        label: 'Mover membros',
        description: 'Mover pessoas entre canais de voz.',
        scope: 'voice'
      },
      {
        name: 'DISCONNECT_MEMBERS',
        label: 'Desconectar membros',
        description: 'Desconectar membros da chamada de voz.',
        scope: 'voice'
      },
      {
        name: 'INVITE_GUESTS',
        label: 'Convidar visitantes',
        description:
          'Gerar um link para alguém de fora do servidor entrar só na call em que você está, por tempo limitado.',
        scope: 'voice'
      }
    ]
  }
]

const groupTitled = (title: string): PermissionGroup =>
  PERMISSION_GROUPS.find((g) => g.title === title) ?? { title, permissions: [] }

/**
 * Os grupos de permissão que valem para um tipo de canal (editor de
 * sobrescritas). O canal de voz tem chat próprio: leva também as de texto.
 */
export function channelPermissionGroups(kind: ChannelKind): PermissionGroup[] {
  const general: PermissionGroup = {
    title: 'Geral',
    permissions: groupTitled('Geral').permissions.filter((p) => p.name === 'VIEW_CHANNEL')
  }
  const text = groupTitled('Canais de texto')
  if (kind === 'text') return [general, text]
  return [
    general,
    groupTitled('Canais de voz'),
    { title: 'Chat do canal de voz', permissions: text.permissions }
  ]
}
