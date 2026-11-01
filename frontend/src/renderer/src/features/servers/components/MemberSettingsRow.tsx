import { useModerationStore } from '../../call/store/moderationStore'
import type { ServerMember } from '../api/servers'
import { nicknameNames, type MemberRowAccess } from '../lib/memberSettings'
import type { Role } from '../lib/permissions'
import Avatar from '../../../shared/ui/Avatar'
import Button from '../../../shared/ui/Button'
import MemberRolesEditor from './MemberRolesEditor'
import OwnerCrown from './OwnerCrown'

interface Props {
  serverId: string
  member: ServerMember
  /** Nome no servidor (apelido, senão o de exibição). */
  name: string
  isOwner: boolean
  isMe: boolean
  access: MemberRowAccess
  own: Role[]
  assignable: Role[]
  onToggleRole: (roleId: string, has: boolean) => void
  /** O dono vê "Transferir posse" nos outros membros. */
  onTransfer?: () => void
}

/** Avatar, nome (com a coroa do dono) e o @. */
function MemberIdentity({
  member,
  name,
  isOwner
}: Pick<Props, 'member' | 'name' | 'isOwner'>): React.JSX.Element {
  return (
    <span className="flex min-w-40 flex-1 items-center gap-3">
      <Avatar userId={member.user_id} name={name} avatarUrl={member.avatar_url} size={32} />
      <span className="min-w-0">
        <span className="block truncate text-ds-sm font-semibold text-strong">
          {name}
          {isOwner && (
            <span className="ml-1.5 inline-flex align-[-2px]">
              <OwnerCrown />
            </span>
          )}
        </span>
        {member.username && <span className="block text-ds-xs text-muted">@{member.username}</span>}
      </span>
    </span>
  )
}

/** Apelido, Expulsar e Banir, cada um só para quem pode. */
function MemberModeration({
  serverId,
  member,
  name,
  isMe,
  access,
  onTransfer
}: Pick<Props, 'serverId' | 'member' | 'name' | 'isMe' | 'access' | 'onTransfer'>): React.JSX.Element {
  const askKick = useModerationStore((s) => s.askKick)
  const askBan = useModerationStore((s) => s.askBan)
  const askNickname = useModerationStore((s) => s.askNickname)
  const target = { serverId, userId: member.user_id, name }
  return (
    <span className="flex shrink-0 flex-wrap gap-2">
      {onTransfer && (
        <Button variant="ghost" size="sm" onClick={onTransfer}>
          Transferir posse
        </Button>
      )}
      {access.nickname && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => askNickname({ ...target, ...nicknameNames(member, name), self: isMe })}
        >
          Apelido
        </Button>
      )}
      {access.kick && (
        <Button variant="ghost" size="sm" onClick={() => askKick(target)}>
          Expulsar
        </Button>
      )}
      {access.ban && (
        <Button variant="danger" size="sm" onClick={() => askBan(target)}>
          Banir
        </Button>
      )}
    </span>
  )
}

/** Uma linha da aba Membros: quem é, a moderação e os cargos. */
function MemberSettingsRow(props: Props): React.JSX.Element {
  const { member, name, access, own, assignable, onToggleRole } = props
  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <MemberIdentity member={member} name={name} isOwner={props.isOwner} />
        <MemberModeration
          serverId={props.serverId}
          member={member}
          name={name}
          isMe={props.isMe}
          access={access}
          onTransfer={props.onTransfer}
        />
      </div>
      <MemberRolesEditor
        name={name}
        own={own}
        memberRoleIds={member.role_ids}
        assignable={assignable}
        editable={access.editRoles}
        onToggle={onToggleRole}
      />
    </li>
  )
}

export default MemberSettingsRow
