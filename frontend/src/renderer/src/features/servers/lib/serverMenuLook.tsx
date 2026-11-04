import {
  CalendarIcon,
  CheckIcon,
  CircleSlashIcon,
  GearIcon,
  HashIcon,
  ImageIcon,
  PencilIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  UserPlusIcon
} from '../../../shared/ui/icons'
import type { SidebarMenuTone } from '../components/SidebarMenuItem'
import type { ServerMenuItem } from './serverMenu'

export interface ServerMenuLook {
  label: string
  icon?: React.ReactNode
  tone?: SidebarMenuTone
}

const SMALL = 'h-3.5 w-3.5'

/** Texto, ícone e cor de cada item (os dois menus do servidor usam esta tabela). */
export const SERVER_MENU_LOOK: Record<ServerMenuItem, ServerMenuLook> = {
  markRead: { label: 'Marcar como lido', icon: <CheckIcon className={SMALL} /> },
  invite: { label: 'Convidar pessoas', icon: <UserPlusIcon className="h-4 w-4" />, tone: 'brand' },
  mute: { label: 'Silenciar servidor', icon: <CircleSlashIcon className={SMALL} /> },
  notifications: { label: 'Notificações do servidor' },
  hideMuted: { label: 'Ocultar canais silenciados' },
  settings: { label: 'Configurações do servidor', icon: <GearIcon className={SMALL} /> },
  level: { label: 'Nível do servidor', icon: <StarIcon className={SMALL} /> },
  profile: { label: 'Perfil do servidor', icon: <ImageIcon className={SMALL} /> },
  nickname: { label: 'Alterar apelido', icon: <PencilIcon className={SMALL} /> },
  memberProfile: { label: 'Editar perfil do servidor', icon: <PencilIcon className={SMALL} /> },
  createChannel: { label: 'Criar canal', icon: <HashIcon className={SMALL} /> },
  createCategory: { label: 'Criar categoria', icon: <PlusIcon className={SMALL} /> },
  events: { label: 'Eventos', icon: <CalendarIcon className={SMALL} /> },
  moveTo: { label: 'Mover para…' },
  leave: { label: 'Sair do servidor', icon: <TrashIcon className={SMALL} />, tone: 'danger' },
  delete: { label: 'Deletar servidor', icon: <TrashIcon className={SMALL} />, tone: 'danger' }
}
