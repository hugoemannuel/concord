import { useRef, useState } from 'react'
import router from '../../../app/router'
import { useAuthStore } from '../../auth/store/authStore'
import { useCallStore } from '../../call/store/callStore'
import { useActivityStore } from '../../activity/store/activityStore'
import { activityOfPlayer, canJoinFromProfile } from '../../activity/lib/activityState'
import { useChatStore } from '../../chat/store/chatStore'
import { useRelationship } from '../../friends/store/friendStore'
import { useLevelStore } from '../../levels/store/levelStore'
import { useBadgeStore } from '../../levels/store/badgeStore'
import { useProfileCardStore, type ProfileCardTarget } from '../store/profileCardStore'
import { useProfileStore } from '../store/profileStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useSettingsStore } from '../../settings/store/settingsStore'
import { changeMyStatus } from '../store/meActions'
import { cardPlacementStyle } from '../lib/profileCard'
import { profileCardView, type ProfileCardView } from '../lib/profileCardView'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { useModerationStore } from '../../call/store/moderationStore'
import { Perm } from '../../servers/lib/permissions'
import { isUserLive, liveTarget, type MyCall } from '../../call/lib/screenPreview'
import { CHOSEN_STATUSES, STATUS_META, type PresenceStatus } from '../../friends/lib/presenceStatus'
import LevelBadge from '../../levels/components/LevelBadge'
import BadgeRow from '../../levels/components/BadgeRow'
import ProfileCardBody, { CARD_BG } from './ProfileCardBody'
import ProfileCardFrame from './ProfileCardFrame'
import CardActions from './card/CardActions'
import CardInfo from './card/CardInfo'
import LiveExtras from './card/LiveExtras'
import { profileThemeLook, resolveProfileTheme } from '../lib/profileTheme'
import StatusIcon from '../../../shared/ui/StatusIcon'
import { AtIcon, ChevronRightIcon, PencilIcon } from '../../../shared/ui/icons'
import { useThemeStore } from '../../settings/store/themeStore'
import { useProfileCardData } from '../hooks/useProfileCardData'
import { useProfileCardPlacement } from '../hooks/useProfileCardPlacement'
import CardMemberProfileNotice from '../../memberProfiles/components/CardMemberProfileNotice'
import ProfileScope from '../../memberProfiles/components/ProfileScope'
import { useCardMemberProfile } from '../../memberProfiles/hooks/useCardMemberProfile'
import { openMemberProfileEditor } from '../../memberProfiles/store/profileEditorScopeStore'

/** Altura aproximada do submenu de status (4 opções, duas com descrição). */
const STATUS_MENU_HEIGHT = 230

function MenuButton({
  icon,
  label,
  onClick,
  trailing
}: {
  icon: React.ReactNode
  label: string
  onClick?: () => void
  trailing?: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left text-ds-sm font-medium text-normal transition-colors hover:bg-fg/10 hover:text-strong"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  )
}

/** "Online ›" com o submenu dos status ao lado, como no Discord. */
function StatusMenu({ status }: { status: PresenceStatus }): React.JSX.Element {
  // O submenu tem o fundo do app: volta ao tema de cor mesmo num cartão com fundo próprio.
  const appTheme = useThemeStore((s) => s.theme)
  const [open, setOpen] = useState(false)
  const [upward, setUpward] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const show = (): void => {
    // Perto do fim da janela (cartão da barra de baixo), abre para cima.
    const rect = ref.current?.getBoundingClientRect()
    setUpward(Boolean(rect && rect.top + STATUS_MENU_HEIGHT > window.innerHeight - 8))
    setOpen(true)
  }
  return (
    <div ref={ref} className="relative" onMouseEnter={show} onMouseLeave={() => setOpen(false)}>
      <MenuButton
        icon={<StatusIcon status={status} size={12} />}
        label={STATUS_META[status].label}
        onClick={() => (open ? setOpen(false) : show())}
        trailing={<ChevronRightIcon size={16} className="text-muted" />}
      />
      {open && (
        // pl-3 em vez de margem: o mouse passa do botão para o menu sem fechar.
        <div className={`absolute left-full z-10 pl-3 ${upward ? 'bottom-0' : 'top-0'}`}>
          <div
            role="menu"
            data-theme={appTheme}
            className="pt-ink-keep w-64 rounded-lg border border-subtle p-1.5 shadow-2xl"
            style={{ background: CARD_BG }}
          >
            {CHOSEN_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                role="menuitemradio"
                aria-checked={status === s}
                onClick={() => {
                  setOpen(false)
                  void changeMyStatus(s)
                }}
                className="flex w-full cursor-pointer items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-fg/10"
              >
                <StatusIcon status={s} size={12} className="mt-1" />
                <span className="min-w-0">
                  <span className="block text-ds-sm font-medium text-strong">
                    {STATUS_META[s].label}
                  </span>
                  {STATUS_META[s].description && (
                    <span className="block text-ds-xs leading-snug text-muted">
                      {STATUS_META[s].description}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NicknameButton({ onClick }: { onClick: () => void }): React.JSX.Element {
  return (
    <MenuButton
      icon={<AtIcon size={16} />}
      label="Alterar apelido"
      onClick={onClick}
    />
  )
}

interface FooterProps {
  view: ProfileCardView
  userId: string
  close: () => void
  onEditProfile: () => void
  onEditNickname: () => void
}

/** No próprio cartão: editar perfil, apelido e status. */
function MeMenu({ view, onEditProfile, onEditNickname }: FooterProps): React.JSX.Element {
  return (
    <div className="mt-3 rounded-lg bg-input p-1.5">
      <MenuButton
        icon={<PencilIcon className="h-4 w-4" />}
        label="Editar perfil"
        onClick={onEditProfile}
      />
      {view.canNickname && <NicknameButton onClick={onEditNickname} />}
      <div className="mx-2 my-1 h-px bg-fg/10" />
      <StatusMenu status={view.status} />
    </div>
  )
}

function NicknameRow({ view, onEditNickname }: FooterProps): React.JSX.Element | null {
  if (!view.canNickname) return null
  return (
    <div className="mt-2 rounded-lg bg-input p-1.5">
      <NicknameButton onClick={onEditNickname} />
    </div>
  )
}

function CardFooter(props: FooterProps): React.JSX.Element {
  const { view, userId, close } = props
  if (view.isMe) return <MeMenu {...props} />
  return (
    <>
      {view.isBot ? null : (
        <CardActions
          userId={userId}
          name={view.shownName}
          displayName={view.card.display_name}
          username={view.card.username}
          relationship={view.link}
          onClose={close}
        />
      )}
      <NicknameRow {...props} />
    </>
  )
}

/** A chamada em que estou (para saber se dá para assistir a live da pessoa). */
function useMyCall(): MyCall {
  const status = useCallStore((s) => s.status)
  const callId = useCallStore((s) => s.callId)
  const type = useCallStore((s) => s.type)
  const channelId = useCallStore((s) => s.channelId)
  const screenSharers = useCallStore((s) => s.screenSharers)
  const availableScreens = useCallStore((s) => s.availableScreens)
  return { status, callId, type, channelId, screenSharers, availableScreens }
}

function ProfileCardContent({ target }: { target: ProfileCardTarget }): React.JSX.Element {
  const close = useProfileCardStore((s) => s.close)
  const me = useAuthStore((s) => s.user)
  const server = useServerStore((s) => s.currentServer)
  const member = useServerStore((s) => s.currentMembers.find((m) => m.user_id === target.userId))
  const roles = useServerStore((s) => s.roles)
  const channels = useServerStore((s) => s.channels)
  const online = useChatStore((s) => Boolean(s.presence[target.userId]))
  const knownStatus = useChatStore((s) => s.statuses[target.userId])
  const serverCalls = useCallStore((s) => s.serverCalls)
  const myCall = useMyCall()
  const level = useLevelStore((s) => s.levels[target.userId])
  const replayLevelUp = useLevelStore((s) => s.replayLevelUp)
  const relationship = useRelationship(target.userId)
  const profile = useProfileStore((s) => s.profiles[target.userId])
  const openSettings = useSettingsStore((s) => s.openSettings)
  const access = useServerAccess()
  const askNickname = useModerationStore((s) => s.askNickname)
  // Os badges chegam depois e podem mudar a altura do cartão.
  const badgesLoaded = useBadgeStore((s) => Boolean(s.byUser[target.userId]))
  // Atividade da chamada em que a pessoa está jogando (só se for a minha call).
  const joinableActivity = useActivityStore((s) =>
    canJoinFromProfile(s, me?.id ?? null, target.userId) ? activityOfPlayer(s, target.userId) : null
  )
  const { mutual, profileSettled, mutualSettled } = useProfileCardData(target, relationship)
  const pathname = router.state.location.pathname
  const memberProfile = useCardMemberProfile(target.userId, server?.id, pathname)

  // Transmitindo agora: selo LIVE e, se dá para assistir, a prévia com o botão.
  const live = isUserLive(target.userId, myCall, serverCalls)
  const stream = liveTarget({
    userId: target.userId,
    meId: me?.id,
    call: myCall,
    serverCalls,
    canConnect: (channelId) => access.canInChannel(channelId, Perm.VIEW_CHANNEL | Perm.CONNECT)
  })
  const view = profileCardView({
    target,
    me,
    profile,
    member,
    server,
    roles,
    channels,
    serverCalls,
    pathname,
    canChangeNickname: access.canChangeNickname(target.userId),
    memberProfile: memberProfile.profile,
    globalView: memberProfile.showingGlobal,
    level,
    online,
    knownStatus,
    mutual,
    profileSettled,
    mutualSettled
  })
  // O perfil, os badges e o que temos em comum chegam depois e mudam a altura.
  const { ref, pos } = useProfileCardPlacement(target, close, [
    profile,
    me,
    mutual,
    badgesLoaded,
    profileSettled,
    mutualSettled,
    stream?.kind,
    stream?.callId,
    live,
    joinableActivity,
    memberProfile.showingGlobal
  ])
  const theme = resolveProfileTheme(view.card.profile_theme)
  const look = profileThemeLook(theme)

  const editProfile = (): void => {
    close()
    // Vendo o próprio perfil do servidor, o atalho edita ele.
    if (memberProfile.openServerId && memberProfile.profile) {
      openMemberProfileEditor(memberProfile.openServerId)
    } else openSettings('profiles')
  }

  const editNickname = (): void => {
    if (!server) return
    close()
    askNickname({
      serverId: server.id,
      userId: target.userId,
      name: view.shownName,
      nickname: view.nickname,
      displayName: view.card.display_name,
      self: view.isMe
    })
  }

  return (
    <ProfileScope serverId={memberProfile.scopeId}>
      <ProfileCardFrame
        ref={ref}
        look={look}
        effect={theme.effect}
        role="dialog"
        aria-label={`Perfil de ${view.shownName}`}
        style={cardPlacementStyle(pos)}
        className="z-[60] text-ds-sm text-normal shadow-2xl"
      >
        <ProfileCardBody
          profile={view.card}
          surface={look.surface}
          status={view.status}
          isMe={view.isMe}
          fallbackBanner={view.fallbackBanner}
          avatarFallbackClassName={view.role.avatar}
          badge={
            <LevelBadge
              userId={target.userId}
              size="md"
              onClick={() => replayLevelUp(target.userId, view.card.display_name)}
            />
          }
          badges={
            <BadgeRow
              userId={target.userId}
              name={view.card.display_name}
              avatarUrl={view.card.avatar_url}
              onOpen={close}
            />
          }
          onEditProfile={view.isMe ? editProfile : undefined}
          loading={view.profileLoading}
        >
          <CardMemberProfileNotice card={memberProfile} />
          <LiveExtras
            target={target}
            stream={stream}
            joinableActivity={joinableActivity}
            name={view.shownName}
            channels={channels}
            close={close}
          />
          <CardInfo
            info={view.info}
            live={live}
            look={{ background: theme.background_colors, ink: look.ink }}
            inServer={view.inServer}
            isServerOwner={view.isServerOwner}
            memberRoles={view.memberRoles}
          />
          <CardFooter
            view={view}
            userId={target.userId}
            close={close}
            onEditProfile={editProfile}
            onEditNickname={editNickname}
          />
        </ProfileCardBody>
      </ProfileCardFrame>
    </ProfileScope>
  )
}

/**
 * Perfil da pessoa, como no Discord: abre ao clicar nela na lista de membros,
 * no canal de voz ou (o próprio) na barra de baixo. Mostra banner, nota, Sobre
 * mim, links, cargo, nível e se está em call. No próprio perfil, a foto leva
 * ao editor e há o menu de status.
 */
function UserProfileCard(): React.JSX.Element | null {
  const target = useProfileCardStore((s) => s.target)
  return target ? <ProfileCardContent target={target} /> : null
}

export default UserProfileCard
