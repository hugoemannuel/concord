const PORT_WAIT_MS = 1000

/**
 * Quanto esperar pela porta com o som da janela: só o Windows tem o helper, e
 * só vale esperar se a fonte escolhida foi uma janela.
 */
export function portWaitMs(pickedWindow: boolean, platform: () => string | undefined): number {
  return pickedWindow && platform() === 'win32' ? PORT_WAIT_MS : 0
}
