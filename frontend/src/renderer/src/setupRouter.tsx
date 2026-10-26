import { createHashRouter, Navigate } from 'react-router-dom'
import Welcome from './pages/Welcome'
import ConnectServer from './pages/ConnectServer'
import HostServer from './pages/HostServer'
import { RouteErrorScreen } from './components/AppErrorScreen'

// Build genérico sem servidor escolhido (NEEDS_SERVER): só a tela inicial.
// Escolhido o servidor, o main reabre o app e vale o router normal. Criado só
// quando usado: um router a mais também escutaria as mudanças do #.
let setupRouter: ReturnType<typeof createHashRouter> | null = null

export function getSetupRouter(): ReturnType<typeof createHashRouter> {
  setupRouter ??= createHashRouter([
    { path: '/', element: <Welcome />, errorElement: <RouteErrorScreen /> },
    { path: '/conectar', element: <ConnectServer />, errorElement: <RouteErrorScreen /> },
    { path: '/hospedar', element: <HostServer />, errorElement: <RouteErrorScreen /> },
    { path: '*', element: <Navigate to="/" replace /> }
  ])
  return setupRouter
}
