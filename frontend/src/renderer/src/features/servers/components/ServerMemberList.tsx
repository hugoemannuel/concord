import { userMenuHandler } from '../../profile/store/userMenuStore'
import { profileCardHandler } from '../../profile/store/profileCardStore'
import { useServerStore } from '../store/serverStore'
import { T18 } from '../../music/lib/music'
import { useAuthStore } from '../../auth/store/authStore'
import { useChatStore, usePresenceStatus } from '../../chat/store/chatStore'
import LevelBadge from '../../levels/components/LevelBadge'
import LevelRowShimmer from '../../levels/components/LevelRowShimmer'
import LevelUpBurst from '../../levels/components/LevelUpBurst'
import Avatar from '../../../shared/ui/Avatar'
import { useUserLook } from '../../profile/store/profileStore'
import ResizeHandle from '../../../shared/ui/ResizeHandle'
import { useResizableWidth } from '../../../shared/hooks/useResizableWidth'
import { groupMembers, memberColor } from '../lib/memberGroups'
import { memberRowLook } from '../lib/memberRowLook'
import { roleColorCss } from '../lib/permissions'
import { serverDisplayName } from '../lib/serverNames'
import { ActivityLine } from '../../activity/components/ActivityLine'
import { useActivity, useInVoice } from '../../activity/store/presenceActivityStore'
import { useListening } from '../../activity/store/listeningStore'
import StyledName from '../../profile/components/StyledName'
import Nameplate from '../../profile/components/Nameplate'
import { useHoverActive } from '../../../shared/hooks/useHoverActive'
import type { NameStyle } from '../../profile/lib/nameStyle'
import type { Server } from '../api/servers'
import OwnerCrown from './OwnerCrown'

interface MemberRowProps {
  userId: string
  displayName: string
  /** Apelido neste servidor (ganha do nome de exibição). */
  nickname?: string | null
  /** Fonte/efeito do nome de exibição (só vale sem apelido). */
  nameStyle?: NameStyle
  handle: string
  avatarUrl?: string | null
  /** Faixa atrás do nome e moldura do avatar (#482). */
  nameplateUrl?: string | null
  decorationUrl?: string | null
  colorClass: string
  nameClass: string
  /** Cor do cargo mais alto que tem cor (CSS); sem ela vale nameClass. */
  nameColor?: string
  online: boolean
  isBot?: boolean
  /** Dono do servidor: a coroa ao lado do nome. */
  isOwner?: boolean
}

export function MemberRow({
  userId,
  displayName,
  nickname,
  nameStyle,
  handle,
  avatarUrl,
  nameplateUrl,
  decorationUrl,
  colorClass,
  nameClass,
  nameColor,
  online,
  isBot = false,
  isOwner = false
}: MemberRowProps): React.JSX.Element {
  const meId = useAuthStore((s) => s.user?.id)
  const status = usePresenceStatus(userId)
  // Só troca o @handle quando há jogo, música (ou "Em voz"): sem atividade, igual a antes.
  const playing = useActivity(userId) !== null
  const listening = useListening(userId) !== null
  const hasActivity = playing || listening
  const inVoice = useInVoice(userId)
  const activityShown = hasActivity || inVoice
  const look = useUserLook(userId, { name: displayName, avatarUrl, nameplateUrl, decorationUrl })
  const name = serverDisplayName({ nickname }, { display_name: look.name })
  const hover = useHoverActive()
  return (
    <div
      key={userId}
      {...hover.bind}
      // Na lista de membros o menu abre até em você (para "Alterar apelido").
      onContextMenu={userMenuHandler(userId, name, meId, handle, { allowSelf: true })}
      onClick={profileCardHandler(userId, name, handle, 'left')}
      className={`group relative flex cursor-pointer items-center gap-3 rounded-lg px-2 py-1 hover:bg-fg/5 ${
        online ? '' : 'opacity-60 hover:opacity-100'
      }`}
    >
      <Nameplate url={look.nameplateUrl} active={hover.active} fade="var(--bg-members)" />
      <LevelRowShimmer userId={userId} />
      <div className="relative shrink-0">
        <LevelUpBurst userId={userId} />
        <Avatar
          userId={userId}
          name={name}
          avatarUrl={avatarUrl}
          decorationUrl={look.decorationUrl}
          active={hover.active}
          size={32}
          // O Maestro não tem websocket: está sempre online.
          status={isBot ? 'online' : status}
          cutoutColor="var(--bg-members)"
          fallbackClassName={colorClass}
        />
      </div>
      <div className="relative min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <p
            title={name}
            style={nameColor ? { color: nameColor } : undefined}
            className={`truncate text-ds-md font-medium ${nameColor ? '' : nameClass}`}
          >
            {nickname?.trim() ? name : <StyledName name={name} userId={userId} style={nameStyle} />}
          </p>
          {isOwner && <OwnerCrown />}
          {isBot ? (
            <span className="rounded bg-brand/30 px-1 text-ds-xxs font-bold uppercase text-brand">
              {T18.tag}
            </span>
          ) : (
            <LevelBadge userId={userId} />
          )}
        </div>
        {activityShown ? (
          <ActivityLine
            userId={userId}
            statusLabel={`@${handle}`}
            className="-mt-0.5 text-ds-xs font-medium text-muted"
          />
        ) : (
          <p title={`@${handle}`} className="-mt-0.5 truncate text-ds-xs font-medium text-muted">
            @{handle}
          </p>
        )}
      </div>
    </div>
  )
}

/** Lista de membros à direita, com a borda de dentro arrastável. */
export function MembersAside({ children }: { children: React.ReactNode }): React.JSX.Element {
  const panel = useResizableWidth('members')
  return (
    <aside
      style={panel.panelStyle}
      className="relative hidden shrink-0 flex-col border-l border-subtle bg-primary lg:flex"
    >
      <ResizeHandle {...panel.handleProps} />
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4">{children}</div>
    </aside>
  )
}

/**
 * Membros do servidor aberto, agrupados como no Discord: cargos exibidos
 * separadamente (online), membros e offline; o dono tem a coroa. Sem moldura: vai na coluna da
 * direita (ServerMemberList) ou na gaveta do celular.
 */
export function ServerMemberGroups({ server }: { server: Server }): React.JSX.Element {
  const me = useAuthStore((s) => s.user)
  const currentMembers = useServerStore((s) => s.currentMembers)
  const roles = useServerStore((s) => s.roles)
  const presence = useChatStore((s) => s.presence)

  const memberGroups = groupMembers({
    members: currentMembers,
    roles,
    // O Maestro não tem websocket: está sempre online.
    isOnline: (userId) =>
      Boolean(presence[userId]) || currentMembers.some((m) => m.user_id === userId && m.is_bot)
  })

  return (
    <>
      {memberGroups.map((group) => {
        const offline = group.key === 'offline'
        return (
          <div key={group.key}>
            <p className="mb-1 text-ds-sm font-medium text-muted">
              {group.title} — {group.members.length}
            </p>
            <div className={`flex flex-col gap-1 ${offline ? 'opacity-70' : ''}`}>
              {group.members.map((m) => {
                const look = memberRowLook(m, { me, offline })
                return (
                  <MemberRow
                    key={m.user_id}
                    userId={m.user_id}
                    displayName={look.displayName}
                    nickname={m.nickname}
                    nameStyle={m.name_style}
                    avatarUrl={m.avatar_url}
                    nameplateUrl={m.nameplate_url}
                    decorationUrl={m.avatar_decoration_url}
                    handle={look.handle}
                    colorClass={look.colorClass}
                    nameClass={look.nameClass}
                    nameColor={roleColorCss(memberColor(roles, m.role_ids))}
                    online={!offline}
                    isBot={!!m.is_bot}
                    isOwner={m.user_id === server.owner_id}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </>
  )
}

/** A coluna de membros à direita (do lg em diante). */
function ServerMemberList({ server }: { server: Server }): React.JSX.Element {
  return (
    <MembersAside>
      <ServerMemberGroups server={server} />
    </MembersAside>
  )
}

export default ServerMemberList
