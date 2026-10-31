import type { SoundName } from '../../call/lib/sounds'

// Os sons do app que a pessoa pode trocar (Configurações → Notificações), com
// o mesmo nome do playSound. Os jingles de nível ficam de fora: acompanham a
// animação. A lista é a mesma do backend (internal/appsound/model.go).

export const SOUND_EVENTS = [
  'message',
  'mention',
  'ring',
  'join',
  'leave',
  'userJoin',
  'userLeave',
  'mute',
  'unmute',
  'deafen',
  'undeafen',
  'liveStart',
  'liveEnd',
  'liveJoin',
  'lock',
  'unlock',
  'knock',
  'update'
] as const satisfies readonly SoundName[]

export type SoundEvent = (typeof SOUND_EVENTS)[number]

export function isSoundEvent(name: string): name is SoundEvent {
  return (SOUND_EVENTS as readonly string[]).includes(name)
}

export interface SoundEventGroup {
  label: string
  events: { id: SoundEvent; label: string }[]
}

/** Como a tela de configurações agrupa e nomeia os eventos. */
export const SOUND_EVENT_GROUPS: SoundEventGroup[] = [
  {
    label: 'Mensagens',
    events: [
      { id: 'message', label: 'Mensagem direta e pedido de amizade' },
      { id: 'mention', label: 'Menção' }
    ]
  },
  {
    label: 'Chamadas',
    events: [
      { id: 'ring', label: 'Chamada recebida' },
      { id: 'join', label: 'Você entrou na call' },
      { id: 'leave', label: 'Você saiu da call' },
      { id: 'userJoin', label: 'Alguém entrou na call' },
      { id: 'userLeave', label: 'Alguém saiu da call' }
    ]
  },
  {
    label: 'Microfone e áudio',
    events: [
      { id: 'mute', label: 'Microfone desligado' },
      { id: 'unmute', label: 'Microfone ligado' },
      { id: 'deafen', label: 'Áudio desligado' },
      { id: 'undeafen', label: 'Áudio ligado' }
    ]
  },
  {
    label: 'Transmissão',
    events: [
      { id: 'liveStart', label: 'Live começou' },
      { id: 'liveEnd', label: 'Live acabou' },
      { id: 'liveJoin', label: 'Alguém começou a assistir' }
    ]
  },
  {
    label: 'Sala trancada',
    events: [
      { id: 'lock', label: 'Sala trancada' },
      { id: 'unlock', label: 'Sala destrancada' },
      { id: 'knock', label: 'Alguém bateu na porta' }
    ]
  },
  {
    label: 'Aplicativo',
    events: [{ id: 'update', label: 'Atualização disponível' }]
  }
]
