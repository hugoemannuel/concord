import { logUpdate } from '../updates/updateLog'
import { TITLE_BAR_COLOR, TITLE_BAR_SYMBOL_COLOR } from '../window/windowPolicy'
import { clearHiddenRelaunch, readSplashColors, saveHiddenRelaunch } from './splashMarks'
import { createSplashWindow } from './splashWindow'
import { startSplash, type StartupSplash } from './startupSplash'

/** Mostra a janelinha de abertura já, com as cores do tema da última vez. */
export function openSplash(hidden: boolean, icon: string): StartupSplash {
  const colors = readSplashColors() ?? {
    color: TITLE_BAR_COLOR,
    symbolColor: TITLE_BAR_SYMBOL_COLOR
  }
  return startSplash({
    hidden,
    window: createSplashWindow({ hidden, icon, colors }),
    log: (message, error) => logUpdate(`abertura: ${message}`, error ?? ''),
    saveHiddenRelaunch: () => saveHiddenRelaunch(),
    clearHiddenRelaunch
  })
}
