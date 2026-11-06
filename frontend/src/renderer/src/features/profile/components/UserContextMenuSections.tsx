import { errorMessage } from '../../../shared/lib/errorMessage'
import { isMaestroIdentity, T18 } from '../../music/lib/music'
import { useProfileCardStore } from '../store/profileCardStore'
import { disableMaestro } from '../../music/api/music'
import { showToast } from '../../../shared/store/toastStore'

export const MENU_WIDTH = 232

interface VolumeControlsRenderer {
  (label: string, muteLabel: string): React.JSX.Element
}

interface StreamMenuProps {
  target: { name: string }
  left: number
  top: number
  menuRef: React.RefObject<HTMLDivElement | null>
  renderVolumeControls: VolumeControlsRenderer
}

export function StreamContextMenu({
  target,
  left,
  top,
  menuRef,
  renderVolumeControls
}: StreamMenuProps): React.JSX.Element {
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Transmissão de ${target.name}`}
      style={{ left, top, width: MENU_WIDTH }}
      data-user-context-menu="true"
      className="fixed z-[80] flex max-h-[calc(100vh-16px)] flex-col gap-1 overflow-y-auto rounded-lg border border-subtle bg-floating p-2 text-ds-sm text-normal shadow-2xl"
    >
      <p className="truncate px-2 pb-1 pt-0.5 text-ds-xs font-bold text-muted">
        Transmissão de {target.name}
      </p>
      {renderVolumeControls('Volume da transmissão', 'Silenciar transmissão')}
    </div>
  )
}

interface MaestroMenuProps {
  target: { userId: string; name: string; username?: string; x: number; y: number }
  left: number
  top: number
  server?: { id: string; owner_id: string } | null
  meId?: string
  itemClass: string
  menuRef: React.RefObject<HTMLDivElement | null>
  close: () => void
  renderVolumeControls: VolumeControlsRenderer
}

export function MaestroContextMenu({
  target,
  left,
  top,
  server,
  meId,
  itemClass,
  menuRef,
  close,
  renderVolumeControls
}: MaestroMenuProps): React.JSX.Element {
  const onStage = isMaestroIdentity(target.userId)
  const removeMaestro = (): void => {
    close()
    if (!server || !window.confirm(T18.confirm)) return
    disableMaestro(server.id).catch((err) =>
      showToast.error(errorMessage(err, 'Falha na operação.'))
    )
  }
  const openMaestroProfile = (): void => {
    close()
    useProfileCardStore.getState().open({
      userId: target.userId,
      name: target.name,
      username: target.username,
      side: 'right',
      anchor: { top: target.y, left: target.x, right: target.x, bottom: target.y }
    })
  }

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Opções de ${target.name}`}
      style={{ left, top, width: MENU_WIDTH }}
      data-user-context-menu="true"
      className="fixed z-[80] flex max-h-[calc(100vh-16px)] flex-col gap-1 overflow-y-auto rounded-lg border border-subtle bg-floating p-2 text-ds-sm text-normal shadow-2xl"
    >
      <p className="truncate px-2 pb-1 pt-0.5 text-ds-xs font-bold text-muted">{target.name}</p>
      {onStage ? (
        renderVolumeControls('Volume', 'Silenciar')
      ) : (
        <button role="menuitem" onClick={openMaestroProfile} className={itemClass}>
          Perfil
        </button>
      )}
      {server?.owner_id === meId && (
        <button role="menuitem" onClick={removeMaestro} className={`${itemClass} text-danger`}>
          {T18.remove}
        </button>
      )}
    </div>
  )
}

interface FriendMenuItemsProps {
  relationship: string
  username?: string
  callIdle: boolean
  call: () => void
  addFriend: () => void
  acceptRequest: () => void
  askRemove: () => void
  askBlock: () => void
  doUnblock: () => void
  itemClass: string
}

export function FriendMenuItems({
  relationship,
  username,
  callIdle,
  call,
  addFriend,
  acceptRequest,
  askRemove,
  askBlock,
  doUnblock,
  itemClass
}: FriendMenuItemsProps): React.JSX.Element {
  return (
    <>
      {relationship === 'friend' && (
        <button
          role="menuitem"
          disabled={!callIdle}
          onClick={() => void call()}
          className={itemClass}
        >
          Ligar
        </button>
      )}
      <div className="my-1 h-px bg-fg/10" />
      {relationship === 'none' && username && (
        <button role="menuitem" onClick={() => void addFriend()} className={itemClass}>
          Adicionar amigo
        </button>
      )}
      {relationship === 'outgoing' && (
        <button role="menuitem" disabled className={itemClass}>
          Pedido de amizade enviado
        </button>
      )}
      {relationship === 'incoming' && (
        <button role="menuitem" onClick={() => void acceptRequest()} className={itemClass}>
          Aceitar pedido de amizade
        </button>
      )}
      {relationship === 'friend' && username && (
        <button role="menuitem" onClick={askRemove} className={`${itemClass} text-danger`}>
          Remover amigo
        </button>
      )}
      {relationship === 'blocked' ? (
        <button role="menuitem" onClick={doUnblock} className={itemClass}>
          Desbloquear
        </button>
      ) : (
        <button role="menuitem" onClick={askBlock} className={`${itemClass} text-danger`}>
          Bloquear
        </button>
      )}
    </>
  )
}

interface SelfMenuProps {
  targetName: string
  left: number
  top: number
  menuRef: React.RefObject<HTMLDivElement | null>
  nicknameItem?: React.JSX.Element | false | null
  /** "Cargos ›" (só o dono dá cargos a si mesmo). */
  rolesItem?: React.ReactNode
  openProfile: () => void
  itemClass: string
}

export function SelfContextMenu({
  targetName,
  left,
  top,
  menuRef,
  nicknameItem,
  rolesItem,
  openProfile,
  itemClass
}: SelfMenuProps): React.JSX.Element {
  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Opções de ${targetName}`}
      style={{ left, top, width: MENU_WIDTH }}
      data-user-context-menu="true"
      className="fixed z-[80] flex max-h-[calc(100vh-16px)] flex-col gap-1 overflow-y-auto rounded-lg border border-subtle bg-floating p-2 text-ds-sm text-normal shadow-2xl"
    >
      <p className="truncate px-2 pb-1 pt-0.5 text-ds-xs font-bold text-muted">
        {targetName}
      </p>
      <button role="menuitem" onClick={openProfile} className={itemClass}>
        Perfil
      </button>
      {nicknameItem}
      {rolesItem}
    </div>
  )
}

export function UserVolumeSection({
  label,
  muteLabel,
  volume,
  muted,
  onVolumeChange,
  onToggleMute
}: {
  label: string
  muteLabel: string
  volume: number
  muted: boolean
  onVolumeChange: (vol: number) => void
  onToggleMute: () => void
}): React.JSX.Element {
  return (
    <>
      <label className="flex flex-col gap-1.5 rounded px-2 py-1.5">
        <span className="text-ds-xs font-semibold text-secondary">
          {label} · {Math.round(volume * 100)}%
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(volume * 100)}
          onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
          aria-label={label}
          className="accent-brand"
        />
      </label>
      <label className="flex cursor-pointer items-center justify-between rounded px-2 py-1.5 hover:bg-fg/5">
        <span>{muteLabel}</span>
        <input
          type="checkbox"
          checked={muted}
          onChange={onToggleMute}
          className="h-4 w-4 accent-danger"
        />
      </label>
    </>
  )
}

interface SelfUserMenuProps {
  target: { name: string; userId: string; x: number; y: number }
  server?: { id: string } | null
  member?: { nickname?: string | null; display_name?: string | null; username?: string } | null
  canNick: boolean
  left: number
  top: number
  menuRef: React.RefObject<HTMLDivElement | null>
  close: () => void
  onEditNickname: () => void
  onOpenProfile: () => void
  itemClass: string
  rolesItem?: React.ReactNode
}

export function SelfUserMenu({
  target,
  canNick,
  rolesItem,
  left,
  top,
  menuRef,
  onEditNickname,
  onOpenProfile,
  itemClass
}: SelfUserMenuProps): React.JSX.Element {
  const nicknameItem = canNick && (
    <button role="menuitem" onClick={onEditNickname} className={itemClass}>
      Alterar apelido
    </button>
  )
  return (
    <SelfContextMenu
      targetName={target.name}
      left={left}
      top={top}
      menuRef={menuRef}
      nicknameItem={nicknameItem}
      rolesItem={rolesItem}
      openProfile={onOpenProfile}
      itemClass={itemClass}
    />
  )
}

interface DMSectionProps {
  target: { userId: string; name: string; conversationId?: string }
  username?: string
  relationship: string
  callIdle: boolean
  itemClass: string
  onOpenProfile: () => void
  onSendMessage: () => void
  onCloseDm: () => void
  onCall: () => void
  onAddFriend: () => void
  onAcceptRequest: () => void
  onAskRemove: () => void
  onAskBlock: () => void
  onDoUnblock: () => void
}

export function StandardUserDMSection({
  target,
  username,
  relationship,
  callIdle,
  itemClass,
  onOpenProfile,
  onSendMessage,
  onCloseDm,
  onCall,
  onAddFriend,
  onAcceptRequest,
  onAskRemove,
  onAskBlock,
  onDoUnblock
}: DMSectionProps): React.JSX.Element {
  return (
    <>
      <button role="menuitem" onClick={onOpenProfile} className={itemClass}>
        Perfil
      </button>
      <button role="menuitem" onClick={onSendMessage} className={itemClass}>
        Mensagem
      </button>
      {target.conversationId && (
        <button role="menuitem" onClick={onCloseDm} className={itemClass}>
          Fechar DM
        </button>
      )}

      <FriendMenuItems
        relationship={relationship}
        username={username}
        callIdle={callIdle}
        call={onCall}
        addFriend={onAddFriend}
        acceptRequest={onAcceptRequest}
        askRemove={onAskRemove}
        askBlock={onAskBlock}
        doUnblock={onDoUnblock}
        itemClass={itemClass}
      />
    </>
  )
}

export { StandardUserServerSection } from './UserContextMenuServerSections'
