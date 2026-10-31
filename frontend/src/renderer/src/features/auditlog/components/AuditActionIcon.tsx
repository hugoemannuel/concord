import type { ComponentType } from 'react'
import {
  ArrowLeftIcon,
  CalendarIcon,
  CircleSlashIcon,
  EnvelopeIcon,
  GearIcon,
  HangUpIcon,
  HashIcon,
  HeadsetOffIcon,
  LockIcon,
  MicOffIcon,
  MusicNoteIcon,
  PencilIcon,
  PinIcon,
  SlidersIcon,
  SmileyIcon,
  SoundboardIcon,
  StickerIcon,
  TrashIcon,
  UndoIcon,
  UserIcon,
  UserPlusIcon,
  VolumeIcon,
  type IconProps
} from '../../../shared/ui/icons'
import { actionInfo, type ActionTone } from '../lib/auditActions'

/** Ícone pelo começo da ação (o domínio); algumas ações têm o próprio. */
const BY_ACTION: Record<string, ComponentType<IconProps>> = {
  'channel.overwrite.update': LockIcon,
  'channel.overwrite.delete': LockIcon,
  'member.role.add': UserIcon,
  'member.role.remove': UserIcon,
  'member.join': UserPlusIcon,
  'member.leave': ArrowLeftIcon,
  'member.kick': CircleSlashIcon,
  'member.ban': CircleSlashIcon,
  'member.unban': UndoIcon,
  'member.nickname': PencilIcon,
  'voice.mute': MicOffIcon,
  'voice.deafen': HeadsetOffIcon,
  'voice.move': VolumeIcon,
  'voice.disconnect': HangUpIcon,
  'message.delete': TrashIcon,
  'guest.remove': CircleSlashIcon
}

const BY_DOMAIN: Record<string, ComponentType<IconProps>> = {
  server: GearIcon,
  bot: MusicNoteIcon,
  invite: EnvelopeIcon,
  guest_invite: EnvelopeIcon,
  channel: HashIcon,
  role: SlidersIcon,
  message: PinIcon,
  emoji: SmileyIcon,
  sticker: StickerIcon,
  sound: SoundboardIcon,
  event: CalendarIcon
}

const TONE_CLASS: Record<ActionTone, string> = {
  create: 'bg-success/15 text-success',
  update: 'bg-warning/15 text-warning',
  delete: 'bg-danger/15 text-danger'
}

/** O ícone da ação num círculo da cor do tom (criar, mudar, apagar). */
export default function AuditActionIcon({ action }: { action: string }): React.JSX.Element {
  const Icon = BY_ACTION[action] ?? BY_DOMAIN[action.split('.')[0]] ?? GearIcon
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[actionInfo(action).tone]}`}
    >
      <Icon size={20} aria-hidden="true" />
    </span>
  )
}
