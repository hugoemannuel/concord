import { createBrowserRouter, createHashRouter, Navigate } from 'react-router-dom'
import Home from './Home'
import Friends from '../features/friends/pages/Friends'
import ServerView from '../features/servers/pages/ServerView'
import DmChat from '../features/chat/pages/DmChat'
import GroupChat from '../features/chat/pages/GroupChat'
import ProposalsPage from '../features/proposals/pages/ProposalsPage'
import Changelog from '../features/updates/pages/Changelog'
import HubBackFrame from '../features/improvements/components/HubBackFrame'
import ImprovementsHub from '../features/improvements/pages/ImprovementsHub'
import Ranking from '../features/ranking/pages/Ranking'
import LiveObservability from '../features/observability/pages/LiveObservability'
import Login from '../features/auth/pages/Login'
import Register from '../features/auth/pages/Register'
import ForgotPassword from '../features/auth/pages/ForgotPassword'
import ResetPassword from '../features/auth/pages/ResetPassword'
import VerifyEmail from '../features/auth/pages/VerifyEmail'
import InviteLanding from '../features/servers/pages/InviteLanding'
import GuestLanding from '../features/guests/pages/GuestLanding'
import GuestSessionGate from '../features/guests/components/GuestSessionGate'
import GuestVisitPage from '../features/guests/pages/GuestVisitPage'
import GuestVisitRedirect from '../features/guests/components/GuestVisitRedirect'
import RequireAuth from '../features/auth/components/RequireAuth'
import RedirectIfAuthed from '../features/auth/components/RedirectIfAuthed'
import AppShell from './AppShell'
import MobileBackFrame from '../features/navigation/components/MobileBackFrame'
import { RouteErrorScreen } from '../shared/ui/AppErrorScreen'
import { IS_WEB } from '../shared/lib/config'

// Desktop carrega de file:// e precisa do hash (#/rota). No navegador as rotas
// são caminhos de verdade: o Caddy devolve o index.html para qualquer rota
// (try_files), então recarregar em /servers/… continua no mesmo lugar.
const createRouter = IS_WEB ? createBrowserRouter : createHashRouter

// errorElement: tela "Algo deu errado" em vez do erro cru do react-router.
export const router = createRouter([
  {
    path: '/',
    element: (
      <GuestSessionGate>
        <RequireAuth>
          <AppShell />
        </RequireAuth>
      </GuestSessionGate>
    ),
    errorElement: <RouteErrorScreen />,
    children: [
      { index: true, element: <Home /> },
      { path: 'friends', element: <Friends /> },
      // Painel das lives, só devs e sem link no app (docs/OBSERVABILIDADE.md).
      {
        path: 'observabilidade',
        element: (
          <MobileBackFrame>
            <LiveObservability />
          </MobileBackFrame>
        )
      },
      // Antiga página de convites: agora é a aba "Convites" do Início.
      { path: 'invites', element: <Navigate to="/friends?tab=invites" replace /> },
      // Aba do diamante: o hub com 3 cards e as telas que ele abre. As telas
      // ganham o "voltar" para o hub (HubBackFrame); só o hub leva à lista no celular.
      {
        path: 'melhorias',
        element: (
          <MobileBackFrame>
            <ImprovementsHub />
          </MobileBackFrame>
        )
      },
      {
        path: 'proposals',
        element: (
          <HubBackFrame>
            <ProposalsPage />
          </HubBackFrame>
        )
      },
      {
        path: 'changelog',
        element: (
          <HubBackFrame>
            <Changelog />
          </HubBackFrame>
        )
      },
      {
        path: 'ranking',
        element: (
          <HubBackFrame>
            <Ranking />
          </HubBackFrame>
        )
      },
      { path: 'dm/:userId', element: <DmChat /> },
      { path: 'dm/c/:conversationId', element: <GroupChat /> },
      // Servidor em que a conta é só visitante abre a visita (/visitas/…).
      {
        path: 'servers/:id',
        element: (
          <GuestVisitRedirect>
            <ServerView />
          </GuestVisitRedirect>
        )
      },
      {
        path: 'servers/:id/channels/:channelId',
        element: (
          <GuestVisitRedirect>
            <ServerView />
          </GuestVisitRedirect>
        )
      },
      // Link de visitante de quem tem conta: só a call do convite, dentro do app.
      { path: 'visitas/:serverId', element: <GuestVisitPage /> }
    ]
  },
  {
    path: '/login',
    element: (
      <RedirectIfAuthed>
        <Login />
      </RedirectIfAuthed>
    ),
    errorElement: <RouteErrorScreen />
  },
  {
    path: '/register',
    element: (
      <RedirectIfAuthed>
        <Register />
      </RedirectIfAuthed>
    ),
    errorElement: <RouteErrorScreen />
  },
  {
    path: '/forgot-password',
    element: (
      <RedirectIfAuthed>
        <ForgotPassword />
      </RedirectIfAuthed>
    )
  },
  // Links dos e-mails: valem com ou sem sessão neste navegador.
  { path: '/reset-password', element: <ResetPassword /> },
  { path: '/verify-email', element: <VerifyEmail /> },
  {
    // Link de convite: abre sem login (o cartão mostra o servidor antes).
    path: '/convite/:code',
    element: <InviteLanding />,
    errorElement: <RouteErrorScreen />
  },
  {
    // Link de visitante para uma call: sem conta, só a call; com conta, a
    // confirmação dentro do app.
    path: '/visitante/:token',
    element: <GuestLanding />,
    errorElement: <RouteErrorScreen />
  },
  {
    path: '*',
    element: <Navigate to="/" replace />
  }
])

export default router
