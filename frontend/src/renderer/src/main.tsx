import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { PREVIEW_BOOST_CALL_ID } from './features/levels/lib/boost'
import { useBoostStore } from './features/levels/store/boostStore'
import { useCallStore } from './features/call/store/callStore'
import { AppErrorBoundary } from './shared/ui/AppErrorScreen'
import { useLevelStore } from './features/levels/store/levelStore'
import { startThemeSync } from './features/settings/store/themeStore'
import { startCustomThemes } from './features/appearance/lib/customThemesStart'
import { startEntranceSounds } from './features/call/lib/entranceSoundStart'
import { startScreenSounds } from './features/call/lib/screenSoundsStart'
import { startAppSounds } from './features/appsounds/lib/appSoundsStart'
import { startArrivalBadges } from './features/call/lib/arrivalEventsStart'
import { startCallInvites } from './features/call/lib/callInviteStart'
import { startSavedProfilesSync } from './features/savedProfiles/lib/savedProfilesStart'
import { startSpeechReport } from './features/call/lib/speechReportStart'
import { startPresenceActivity } from './features/activity/lib/presenceActivityStart'
import { startTTS } from './features/tts/lib/ttsStart'
import { startSessionRevoked } from './features/auth/lib/sessionRevokedStart'
import { startServerLevels } from './features/serverlevel/lib/serverLevelStart'

// Tema salvo antes do primeiro render: o app já abre com as cores certas (os
// temas próprios primeiro, para o CSS deles existir quando o tema for aplicado).
startCustomThemes()
startThemeSync()

// Sons escolhidos em Configurações → Notificações (trocam os do playSound).
startAppSounds()

// Som de quem entra na call (o som de entrada da pessoa ou o padrão).
startEntranceSounds()

// Sons da transmissão: live aberta, encerrada e alguém entrando nela.
startScreenSounds()

// Selo "Chegou" de quem entra no canal de voz.
startArrivalBadges()

// Aviso de fala para o servidor: 10 min sem falar na call para o XP e os badges.
startSpeechReport()

// Cartões de convite para a call na DM: viram "inválidos" quando a call acaba.
startCallInvites()

// Perfis salvos: a lista acompanha as mudanças feitas em outros aparelhos.
startSavedProfilesSync()

// O jogo e a música dos outros agora (presence:activity).
startPresenceActivity()

// Nível do servidor: a barra anda e a subida vira um toast (server:level:*).
startServerLevels()

// Mensagens /tts lidas em voz para quem está em call.
startTTS()

// Sessão encerrada pelo servidor (WS 4001): volta ao login.
startSessionRevoked()

// Soltar um arquivo fora do chat não pode fazer o Electron abrir o arquivo no
// lugar do app (o chat trata o próprio drop).
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

// Dev: `__salinhaLevelUp(85)` no console toca a animação de subir de nível;
// `__salinhaLevelUp('marco')` toca o pr�ximo marco depois do seu n�vel.
// `__salinhaBoost(175)` liga um buff de XP falso (125/150/175/200/250/300/400) na sua call.
if (import.meta.env.DEV) {
  const dev = window as unknown as {
    __salinhaLevelUp: (level: number | 'marco') => void
    __salinhaBoost: (percent: number) => void
  }
  dev.__salinhaLevelUp = (level) => {
    const store = useLevelStore.getState()
    if (level === 'marco') store.previewNextMilestone()
    else store.previewLevelUp(level)
  }
  dev.__salinhaBoost = (percent) =>
    useBoostStore.getState().previewBoost(useCallStore.getState().callId ?? PREVIEW_BOOST_CALL_ID, percent)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
)
