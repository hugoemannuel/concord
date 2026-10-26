import { RouterProvider } from 'react-router-dom'
import router from './router'
import Background from './components/Background'
import ToastContainer from './components/ToastContainer'
import BackgroundBridge from './components/BackgroundBridge'
import OverlayBridge from './components/OverlayBridge'
import GameActivityBridge from './components/GameActivityBridge'
import UpdateBridge from './components/UpdateBridge'
import SandboxNotice from './components/SandboxNotice'
import AutoUpdateUnavailableNotice from './components/AutoUpdateUnavailableNotice'
import UpdateCallBridge from './components/UpdateCallBridge'
import UserContextMenu from './components/UserContextMenu'
import UserProfileCard from './components/UserProfileCard'
import FriendActionsHost from './components/friends/FriendActionsHost'
import SettingsScreen from './components/settings/SettingsScreen'
import ServerSettingsScreen from './components/serverSettings/ServerSettingsScreen'
import ModerationHost from './components/ModerationHost'
import TitleBar from './components/TitleBar'
import WebNotificationBridge from './components/WebNotificationBridge'
import WebLeaveGuard from './components/WebLeaveGuard'
import { IS_WEB, NEEDS_SERVER } from './lib/config'
import { getSetupRouter } from './setupRouter'
import { currentPlatform, hasCustomTitleBar } from './lib/titleBar'

const customTitleBar = hasCustomTitleBar(currentPlatform())

/** Moldura com a barra de título própria (Windows), como o app normal. */
function Frame({ children }: { children: React.ReactNode }): React.JSX.Element {
  if (!customTitleBar) return <>{children}</>
  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <div className="relative min-h-0 flex-1">{children}</div>
    </div>
  )
}

function App(): React.JSX.Element {
  // Build genérico, primeira vez: só a tela inicial (sem servidor não há
  // conta, chat nem atualizações para ligar).
  if (NEEDS_SERVER) {
    return (
      <>
        <Background />
        <ToastContainer />
        <Frame>
          <RouterProvider router={getSetupRouter()} />
        </Frame>
      </>
    )
  }
  return (
    <>
      <Background />
      <ToastContainer />
      {IS_WEB ? (
        <>
          <WebNotificationBridge />
          <WebLeaveGuard />
        </>
      ) : (
        <>
          {/* Só no Electron: bandeja, overlay de jogo e atualizações. */}
          <BackgroundBridge />
          <OverlayBridge />
          <GameActivityBridge />
          <UpdateBridge />
          <SandboxNotice />
          <AutoUpdateUnavailableNotice />
          <UpdateCallBridge />
        </>
      )}
      <UserContextMenu />
      <UserProfileCard />
      <FriendActionsHost />
      <SettingsScreen />
      <ServerSettingsScreen />
      <ModerationHost />
      <Frame>
        <RouterProvider router={router} />
      </Frame>
    </>
  )
}

export default App
