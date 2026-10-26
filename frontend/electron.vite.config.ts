import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import { buildConnectSrc, buildMediaSrc } from './src/renderer/src/lib/serverUrl'
import { cspPlugin, rendererShared } from './vite.renderer.shared'

const serverUrl = process.env.VITE_SERVER_URL?.trim() ?? ''

export default defineConfig(({ command }) => ({
  main: {
    define: {
      // Vazio = build genérico: o servidor vem da tela inicial (serverSwitch.ts)
      // e as atualizações de <servidor>/updates/, assinadas pelo projeto.
      __CONCORD_SERVER_URL__: JSON.stringify(serverUrl),
      __CONCORD_UPDATE_PUBKEY__: JSON.stringify(process.env.CONCORD_UPDATE_PUBKEY ?? '')
    }
  },
  preload: {},
  renderer: {
    // Aliases, plugins e assets: iguais aos do build web (vite.renderer.shared.ts).
    // A CSP precisa liberar o servidor (API, WebSocket e mídia do chat). Com o
    // servidor embutido (ou no dev, com o backend local) ela sai pronta; no
    // build genérico os marcadores ficam e o main os preenche ao abrir.
    ...rendererShared(
      ...(serverUrl || command === 'serve'
        ? [cspPlugin(buildConnectSrc(serverUrl), buildMediaSrc(serverUrl))]
        : [])
    ),
    // Duas páginas: o app e o overlay de jogo (janela à parte, sem rede).
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    }
  }
}))
