import { resolve } from 'path'
import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import {
  buildWebConnectSrc,
  buildWebMediaSrc,
  WEB_EXTRA_CSP
} from './src/renderer/src/shared/lib/serverUrl'
import { cspPlugin, rendererShared, SOURCEMAP_BUILD } from './vite.renderer.shared'

// Salinha no navegador (yarn build:web → dist-web/). O mesmo renderer do app
// desktop, sem o overlay de jogo, falando com o backend na mesma origem (o
// Caddy serve os arquivos e repassa /api, /ws e /rtc ao backend).

/** Endereço público do app web, para a CSP liberar o wss dele. */
const publicUrl = process.env.WEB_PUBLIC_URL ?? 'https://app-salinha.bhrx.com.br'

/** Backend local para `yarn dev:web` / `yarn preview:web` (faz o papel do Caddy). */
const backend = process.env.WEB_BACKEND_URL ?? 'http://localhost:8080'
const backendWs = backend.replace(/^http/, 'ws')
const proxy: Record<string, ProxyOptions> = {
  '/api': { target: backend, changeOrigin: true },
  '/ws': { target: backendWs, ws: true, changeOrigin: true },
  '/rtc': { target: backend, ws: true, changeOrigin: true }
}

// Ícone da aba (o desktop usa o ícone do executável).
const webHeadPlugin: Plugin = {
  name: 'salinha-web-head',
  transformIndexHtml: () => [
    {
      tag: 'link',
      attrs: { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      injectTo: 'head'
    },
    {
      tag: 'link',
      attrs: { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32.png' },
      injectTo: 'head'
    },
    {
      tag: 'link',
      attrs: { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      injectTo: 'head'
    },
    { tag: 'meta', attrs: { name: 'theme-color', content: '#121214' }, injectTo: 'head' }
  ]
}

export default defineConfig({
  ...rendererShared(
    cspPlugin(buildWebConnectSrc(publicUrl), buildWebMediaSrc(), WEB_EXTRA_CSP),
    webHeadPlugin
  ),
  root: resolve('src/renderer'),
  // Caminhos absolutos: o index.html é servido em qualquer rota (/servers/…).
  base: '/',
  publicDir: resolve('web-public'),
  define: {
    'import.meta.env.VITE_APP_TARGET': JSON.stringify('web')
  },
  build: {
    outDir: resolve('dist-web'),
    emptyOutDir: true,
    // Source maps "hidden", fora do dist-web (SOURCEMAP_BUILD, docs/adr/0068).
    sourcemap: SOURCEMAP_BUILD.sourcemap,
    // Só o app: o overlay de jogo é uma janela do Electron.
    rollupOptions: {
      ...SOURCEMAP_BUILD.rollupOptions,
      input: resolve('src/renderer/index.html')
    }
  },
  server: { port: 5175, strictPort: true, proxy },
  preview: { port: 4173, strictPort: true, proxy }
})
