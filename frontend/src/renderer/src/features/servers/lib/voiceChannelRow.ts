// Regras da linha do canal de voz na barra de canais (sem React).

/**
 * Nomes longos quebram linha em vez de cortar com "…" (o canal "predador-🐺-vs…"
 * aparecia pela metade). `anywhere` também quebra palavra gigante sem hífen.
 */
export const WRAP_NAME = 'break-words [overflow-wrap:anywhere]'

/** Onde a pessoa está na chamada (o pedaço do callStore que importa aqui). */
export interface CallPosition {
  status: string
  type: string | null
  channelId: string | null
}

/** Estou conectado neste canal de voz? */
export function isConnectedTo(call: CallPosition, channelId: string): boolean {
  return call.status !== 'idle' && call.type === 'channel' && call.channelId === channelId
}

/**
 * A call a que "Convidar amigos" se refere: a do canal em que estou conectado
 * (chamada de canal já ativa). Fora disso, não há convite a fazer (null).
 */
export function inviteCallId(
  call: CallPosition & { callId: string | null },
  channelId: string
): string | null {
  if (!isConnectedTo(call, channelId) || call.status !== 'active') return null
  return call.callId ?? null
}

export type KnockView = 'pending' | 'declined' | null

/** O meu pedido para entrar na sala trancada, se for deste canal. */
export function knockView(
  knock: { channelId: string; status: 'pending' | 'declined' } | null,
  channelId: string
): KnockView {
  return knock?.channelId === channelId ? knock.status : null
}

/** Dica do botão do canal: desconectar, conectar ou sem permissão. */
export function voiceRowTitle(connectedHere: boolean, canConnect: boolean): string {
  if (connectedHere) return 'Desconectar'
  return canConnect ? 'Conectar ao canal de voz' : 'Você não tem permissão para entrar neste canal'
}

export interface VoiceRowLook {
  canConnect: boolean
  /** Tem o "•••" (quem gerencia o canal ou pode convidar). */
  hasMenu: boolean
  hasPeople: boolean
  /** Alguém está sendo arrastado sobre o canal. */
  dropActive: boolean
  connectedHere: boolean
  /** Tem o botão "Convidar amigos" (estou conectado neste canal). */
  hasInvite?: boolean
}

/** Classes do botão do canal de voz. */
export function voiceRowClass(look: VoiceRowLook): string {
  const dim = look.canConnect ? '' : 'opacity-60'
  // À direita ficam o balão "Abrir chat" e o "•••" (quem gerencia ou convida). Na tela
  // estreita (toque) eles estão sempre lá; do sm em diante só no hover, e com
  // gente no canal tomam o lugar da contagem, que some.
  // "Convidar amigos" (quem está conectado) ganha mais um botão à esquerda do balão.
  const buttons = look.hasMenu ? (look.hasInvite ? 'pr-20' : 'pr-12') : look.hasInvite ? 'pr-14' : 'pr-7'
  const pad = `${buttons} ${look.hasPeople ? 'sm:pr-2.5' : `sm:${buttons}`}`
  let tone = 'text-muted hover:bg-fg/6 hover:text-normal'
  if (look.dropActive) tone = 'bg-brand/25 text-strong ring-2 ring-brand'
  else if (look.connectedHere) tone = 'text-strong hover:bg-fg/6'
  return `flex w-full items-start gap-2 rounded-lg py-1 pl-2.5 text-left text-ds-md font-medium transition-all cursor-pointer ${dim} ${pad} ${tone}`
}

/** Microfone e fone de quem está no canal: o meu vem do estado local (na hora). */
export function shownVoiceState(
  participant: { muted?: boolean; deafened?: boolean },
  isMeHere: boolean,
  mine: { muted: boolean; deafened: boolean }
): { muted?: boolean; deafened?: boolean } {
  return isMeHere ? mine : { muted: participant.muted, deafened: participant.deafened }
}
