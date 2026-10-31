import { RouterProvider } from 'react-router-dom'
import router from './router'
import Background from '../shared/ui/Background'
import ToastContainer from '../shared/ui/ToastContainer'
import BackgroundBridge from './BackgroundBridge'
import PerfBridge from './PerfBridge'
import WindowActivityBridge from './WindowActivityBridge'
import OverlayBridge from '../features/overlay/components/OverlayBridge'
import GameActivityBridge from '../features/activity/components/GameActivityBridge'
import MusicActivityBridge from '../features/activity/components/MusicActivityBridge'
import UpdateBridge from '../features/updates/components/UpdateBridge'
import NoticeStack from '../features/updates/components/NoticeStack'
import SandboxNotice from '../features/updates/components/SandboxNotice'
import AutoUpdateUnavailableNotice from '../features/updates/components/AutoUpdateUnavailableNotice'
import UpdateCallBridge from '../features/updates/components/UpdateCallBridge'
import UserContextMenu from '../features/profile/components/UserContextMenu'
import ImageContextMenu from '../features/chat/components/ImageContextMenu'
import ReactionLimitModal from '../features/chat/components/ReactionLimitModal'
import UserProfileCard from '../features/profile/components/UserProfileCard'
import FriendActionsHost from '../features/friends/components/FriendActionsHost'
import SettingsScreen from '../features/settings/components/SettingsScreen'
import ServerSettingsScreen from '../features/servers/components/ServerSettingsScreen'
import ModerationHost from '../features/call/components/ModerationHost'
import StreamJoinHost from './StreamJoinHost'
import TitleBar from '../shared/ui/TitleBar'
import TitleBarServerSlot from './TitleBarServerSlot'
import WebNotificationBridge from '../features/notifications/components/WebNotificationBridge'
import WebLeaveGuard from '../features/call/components/WebLeaveGuard'
import CallPresenceBridge from '../features/call/components/CallPresenceBridge'
import LiveTelemetryBridge from '../features/observability/components/LiveTelemetryBridge'
import { IS_WEB } from '../shared/lib/config'
import { currentPlatform, hasCustomTitleBar } from '../shared/lib/titleBar'

const customTitleBar = hasCustomTitleBar(currentPlatform())

function App(): React.JSX.Element {
  return (
    <>
      <Background />
      <ToastContainer />
      <WindowActivityBridge />
      <CallPresenceBridge />
      <LiveTelemetryBridge />
      {IS_WEB ? (
        <>
          <WebNotificationBridge />
          <WebLeaveGuard />
        </>
      ) : (
        <>
          {/* Só no Electron: bandeja, overlay de jogo e atualizações. */}
          <BackgroundBridge />
          <PerfBridge />
          <OverlayBridge />
          <GameActivityBridge />
          <MusicActivityBridge />
          <UpdateBridge />
          <NoticeStack>
            <SandboxNotice />
            <AutoUpdateUnavailableNotice />
          </NoticeStack>
          <UpdateCallBridge />
        </>
      )}
      <UserProfileCard />
      <UserContextMenu />
      <ImageContextMenu />
      <ReactionLimitModal />
      <FriendActionsHost />
      <SettingsScreen />
      <ServerSettingsScreen />
      <ModerationHost />
      <StreamJoinHost />
      {customTitleBar ? (
        <div className="flex h-full flex-col">
          <TitleBar center={<TitleBarServerSlot />} />
          <div className="relative min-h-0 flex-1">
            <RouterProvider router={router} />
          </div>
        </div>
      ) : (
        <RouterProvider router={router} />
      )}
    </>
  )
}

export default App
