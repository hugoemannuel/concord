import NotifySettingsModal from '../features/notifications/components/NotifySettingsModal'
import { Outlet, useLocation } from 'react-router-dom'
import ServerRail from '../features/servers/components/ServerRail'
import FriendsSidebar from '../features/friends/components/FriendsSidebar'
import ServerSidebar from '../features/servers/components/ServerSidebar'
import IncomingCallModal from '../features/call/components/IncomingCallModal'
import CallOverlay from '../features/call/components/CallOverlay'
import BirthdayModal from '../features/profile/components/BirthdayModal'
import EmailVerifyBanner from '../features/auth/components/EmailVerifyBanner'
import ConnectionBanner from '../shared/ui/ConnectionBanner'
import ScreenMiniPlayer from '../features/call/components/ScreenMiniPlayer'
import ActivityPanel from '../features/call/components/ActivityPanel'
import ScreenSharePrompt from '../features/call/components/ScreenSharePrompt'
import VideoBackgroundModal from '../features/call/components/VideoBackgroundModal'
import JoinRequestsStack from '../features/call/components/JoinRequestsStack'
import LevelUpBanner from '../features/levels/components/LevelUpBanner'
import BoostBanner from '../features/levels/components/BoostBanner'
import LevelUpScreen from '../features/levels/components/LevelUpScreen'
import InviteConfirmModal from '../features/servers/components/InviteConfirmModal'
import LevelUpMilestone from '../features/levels/components/LevelUpMilestone'
import ServerLevelUpOverlay from '../features/serverlevel/components/ServerLevelUpOverlay'
import { useFlushPendingLevelUp } from '../features/levels/hooks/useScreenCelebration'
import BadgesModal from '../features/levels/components/BadgesModal'
import BadgeUnlockToast from '../features/levels/components/BadgeUnlockToast'
import EnqueteHost from '../features/enquete/components/EnqueteHost'
import QuickSwitcherModal from '../features/friends/components/QuickSwitcherModal'
import ShortcutsModal from '../features/settings/components/ShortcutsModal'
import { useGlobalShortcuts } from '../features/settings/hooks/useGlobalShortcuts'
import { useInviteLinkClicks } from '../features/servers/hooks/useInviteLinkClicks'
import { useGuestLinkClicks } from '../features/guests/hooks/useGuestLinkClicks'
import { useGuestVisitsSync } from '../features/guests/hooks/useGuestVisitsSync'
import GuestVisitSidebar from '../features/guests/components/GuestVisitSidebar'
import GuestVisitConfirmModal from '../features/guests/components/GuestVisitConfirmModal'
import { sectionKind } from '../features/navigation/lib/mobileNav'
import { useAuthStore } from '../features/auth/store/authStore'
import { useSessionConnection } from '../features/auth/hooks/useSessionConnection'
import { useAccountRefresh } from '../features/auth/hooks/useAccountRefresh'
import { useUIStore } from '../shared/store/uiStore'
import { useAppViewportHeight } from '../shared/hooks/useAppViewportHeight'
import { useMobileShell } from '../features/navigation/hooks/useMobileShell'

// A coluna ao lado do trilho: a do servidor, a da visita (link de visitante)
// ou, no resto, as DMs.
const SIDEBARS: Record<string, () => React.JSX.Element> = {
  server: ServerSidebar,
  visit: GuestVisitSidebar
}

// Celular: a barra de canais/DMs (a <aside> depois da do trilho) ocupa o resto
// da largura, sem a largura arrastável do desktop.
const NAV_FILL =
  'max-md:[&>aside~aside]:w-auto! max-md:[&>aside~aside]:min-w-0 max-md:[&>aside~aside]:flex-1'

function AppShell(): React.JSX.Element {
  useFlushPendingLevelUp()
  useGlobalShortcuts()
  useInviteLinkClicks()
  useGuestLinkClicks()
  const quickSwitcherOpen = useUIStore((s) => s.quickSwitcherOpen)
  const setQuickSwitcherOpen = useUIStore((s) => s.setQuickSwitcherOpen)
  const location = useLocation()
  const Sidebar = SIDEBARS[sectionKind(location.pathname)] ?? FriendsSidebar
  const hasToken = Boolean(useAuthStore((s) => s.accessToken))

  useSessionConnection(hasToken)
  // A conta salva no aparelho pode estar velha (ex.: e-mail confirmado no navegador).
  useAccountRefresh(hasToken)
  useGuestVisitsSync(hasToken)
  useAppViewportHeight()
  // Celular: uma coluna por vez (a lista ou o conteúdo). Desktop: as duas.
  const { columns, contentRef } = useMobileShell()

  return (
    <div className="flex h-full">
      <div className={`${columns.nav} ${NAV_FILL}`}>
        <ServerRail />
        <Sidebar />
      </div>
      <div ref={contentRef} className={`flex min-w-0 flex-1 flex-col ${columns.content}`}>
        <ConnectionBanner />
        <EmailVerifyBanner />
        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
      <IncomingCallModal />
      <JoinRequestsStack />
      <CallOverlay />
      <BirthdayModal />
      <ScreenMiniPlayer />
      <ActivityPanel />
      <ScreenSharePrompt />
      <VideoBackgroundModal />
      <LevelUpScreen />
      <InviteConfirmModal />
      <GuestVisitConfirmModal />
      <LevelUpMilestone />
      <ServerLevelUpOverlay />

      <LevelUpBanner />
      <BoostBanner />
      <BadgeUnlockToast />
      <EnqueteHost />
      <BadgesModal />
      <NotifySettingsModal />
      {quickSwitcherOpen && <QuickSwitcherModal open onClose={() => setQuickSwitcherOpen(false)} />}
      <ShortcutsModal />
    </div>
  )
}

export default AppShell
