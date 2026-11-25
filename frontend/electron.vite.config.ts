import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import {
  buildConnectSrc,
  buildMediaSrc,
  serverCandidates
} from './src/renderer/src/shared/lib/serverUrl'
import { cspPlugin, rendererShared, SOURCEMAP_BUILD } from './vite.renderer.shared'

// Endereço do servidor e os alternativos (o app usa o primeiro que responde
// ao abrir; ver src/main/server/serverChoice.ts).
const servers = serverCandidates(
  process.env.VITE_SERVER_URL,
  process.env.VITE_SERVER_FALLBACK_URLS
)

// A CSP do renderer precisa liberar o servidor embutido no build e os
// alternativos (API, WebSocket e os arquivos de mídia do chat).
const connectSrcPlugin = cspPlugin(
  buildConnectSrc(process.env.VITE_SERVER_URL, servers.slice(1)),
  buildMediaSrc(process.env.VITE_SERVER_URL, servers.slice(1))
)

// Atualizações: servidas pelo próprio servidor e assinadas pelo dono.
const serverUrl = process.env.VITE_SERVER_URL?.trim()
const updateUrl = serverUrl ? new URL('/updates/', serverUrl).toString() : ''

export default defineConfig({
  main: {
    define: {
      __CONCORD_UPDATE_URL__: JSON.stringify(updateUrl),
      __CONCORD_SERVER_URLS__: JSON.stringify(servers),
      __CONCORD_UPDATE_PUBKEY__: JSON.stringify(process.env.CONCORD_UPDATE_PUBKEY ?? '')
    }
  },
  preload: {},
  renderer: {
    // Aliases, plugins e assets: iguais aos do build web (vite.renderer.shared.ts).
    ...rendererShared(connectSrcPlugin),
    // Duas páginas: o app e o overlay de jogo (janela à parte, sem rede).
    // Source maps "hidden", fora do pacote (SOURCEMAP_BUILD, docs/adr/0068).
    build: {
      sourcemap: SOURCEMAP_BUILD.sourcemap,
      rollupOptions: {
        ...SOURCEMAP_BUILD.rollupOptions,
        input: {
          index: resolve('src/renderer/index.html'),
          overlay: resolve('src/renderer/overlay.html')
        }
      }
    }
  }
})
