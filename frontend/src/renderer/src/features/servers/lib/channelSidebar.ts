// Regras da barra de canais do servidor (sem React).
import type { CallStateResponse } from '../../call/api/calls'
import type { Channel } from '../api/channels'
import { primaryChannelId } from './primaryChannel'

export interface SidebarSections {
  /** A lista já é deste servidor (senão mostra o skeleton). */
  ready: boolean
  text: Channel[]
  voice: Channel[]
  primaryId: string | null
}

/**
 * Canais de texto e de voz da barra. `channels` é o do servidor anterior até a
 * busca do atual voltar: só mostra a lista quando for deste servidor (ou já
 * tiver canais dele).
 */
export function sidebarSections(
  server: { id: string; primary_channel_id?: string | null } | null,
  channels: Channel[],
  loadedFor: string | null
): SidebarSections {
  const id = server?.id
  const ready = Boolean(id) && (loadedFor === id || channels.some((c) => c.server_id === id))
  const shown = ready ? channels : []
  return {
    ready,
    text: shown.filter((ch) => (ch.type ?? 'text') === 'text'),
    voice: shown.filter((ch) => ch.type === 'voice'),
    primaryId: primaryChannelId(server, channels)
  }
}

/**
 * Canal de texto: todo membro abre o menu (notificações). Canal de voz: só
 * quem gerencia canais ou as permissões dele. Cada item de moderação se
 * esconde sozinho sem a permissão.
 */
export function canOpenChannelMenu(
  channel: Pick<Channel, 'type'>,
  canManageChannels: boolean,
  canManageRolesHere: boolean
): boolean {
  return (channel.type ?? 'text') === 'text' || canManageChannels || canManageRolesHere
}

/** Clique fora do menu do canal (e fora do "•••", que alterna sozinho) fecha. */
export function shouldDismissMenu(target: Element | null, menu: Element | null): boolean {
  if (!target || menu?.contains(target)) return false
  return !target.closest('[data-channel-menu-button]')
}

/** Nome do canal como o servidor guarda: minúsculo e com hífen no lugar de espaço. */
export function channelSlug(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, '-')
}

/** Mensagem do erro (ou o texto padrão, se não veio uma). */
export function errorText(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

/**
 * Todo mundo nos canais de voz, ordenado e numa chave só: os níveis vêm num
 * pedido só e a lista reordena uma vez quando chegam, não a cada selo.
 */
export function voiceUserIdsKey(serverCalls: Record<string, CallStateResponse>): string {
  return Object.values(serverCalls)
    .flatMap((entry) => entry.participants.map((p) => p.user_id))
    .sort()
    .join(',')
}

export interface TextRowLook {
  canOpenMenu: boolean
  active: boolean
  /** Silenciado, sem menção e fora do canal: apagado. */
  dim: boolean
}

/** Classes do botão do canal de texto. */
export function textRowClass(look: TextRowLook): string {
  const pad = look.canOpenMenu ? 'pr-7' : 'pr-2.5'
  const tone = look.active
    ? 'bg-fg/10 text-strong shadow-sm'
    : 'text-muted hover:bg-fg/6 hover:text-normal'
  return `flex w-full items-start gap-2 rounded-lg py-1 pl-2.5 text-left text-ds-md font-medium transition-all cursor-pointer ${pad} ${tone} ${look.dim ? 'opacity-50' : ''}`
}
