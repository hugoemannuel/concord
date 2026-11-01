import './overlay.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import OverlayApp from './OverlayApp'
import { startThemeSync } from '../features/settings/store/themeStore'
import { startCustomThemes } from '../features/appearance/lib/customThemesStart'

// Mesmo tema do app (o localStorage é o mesmo; troca lá, troca aqui), inclusive
// os temas próprios, que o app mantém na cópia local.
startCustomThemes({ account: false })
startThemeSync({ titleBar: false })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <OverlayApp />
  </StrictMode>
)
