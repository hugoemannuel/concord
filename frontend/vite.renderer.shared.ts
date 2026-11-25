import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { basename, join, resolve } from 'path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { Plugin, UserConfig } from 'vite'
import { fillCsp } from './src/renderer/src/shared/lib/serverUrl'
import { buildVersion } from './src/renderer/src/shared/lib/appVersion'

// O que o renderer tem igual no app desktop (electron.vite.config.ts) e no
// navegador (vite.web.config.ts): aliases, plugins e assets. Mexeu aqui, os
// dois builds acompanham.

/** Preenche a CSP do index.html com o que o build libera de rede e mídia. */
export function cspPlugin(connectSrc: string, mediaSrc: string, extra?: string): Plugin {
  return {
    name: 'concord-connect-src',
    transformIndexHtml: (html: string): string => fillCsp(html, { connectSrc, mediaSrc, extra })
  }
}

/**
 * A OFL exige que a licença (com o copyright "The Outfit Project Authors")
 * acompanhe toda cópia da fonte: vai como assets/OFL.txt, ao lado dos woff2,
 * no out/renderer (desktop) e no dist-web. O instalador também leva uma cópia
 * em resources/licenses (electron-builder.yml).
 */
// Fontes do estilo de nome (assets/nameFonts.css), todas OFL com copyright próprio.
const NAME_FONT_PACKAGES = [
  'bitter',
  'pacifico',
  'chango',
  'montserrat',
  'cinzel-decorative',
  'press-start-2p',
  'grenze-gotisch',
  'caveat',
  'zilla-slab',
  'oswald',
  'jetbrains-mono',
  'bungee',
  'silkscreen',
  'vt323',
  'dancing-script',
  'great-vibes',
  'unifrakturmaguntia',
  'space-mono',
  'fredoka',
  'comfortaa',
  'lobster',
  'righteous',
  'monoton',
  'bangers',
  'orbitron',
  'creepster'
]

export const fontLicensePlugin: Plugin = {
  name: 'salinha-font-license',
  apply: 'build',
  generateBundle() {
    const licenses: [string, string][] = [
      ['outfit', 'node_modules/@fontsource-variable/outfit/LICENSE'],
      ...NAME_FONT_PACKAGES.map((p): [string, string] => [p, `node_modules/@fontsource/${p}/LICENSE`])
    ]
    this.emitFile({
      type: 'asset',
      fileName: 'assets/OFL.txt',
      source: licenses
        .map(([name, file]) => `=== ${name} ===\n${readFileSync(resolve(file), 'utf8')}`)
        .join('\n\n')
    })
  }
}

/**
 * Source maps do renderer (docs/adr/0068): o build gera "hidden" (sem o
 * comentário sourceMappingURL) e sem o código-fonte (sourcesContent); este
 * plugin tira os .map da saída para frontend/sourcemaps/ (mesmo nome, numa
 * pasta só). Nem o instalador nem o dist-web levam .map; o deploy manda a
 * pasta para o servidor, que traduz a pilha dos erros sem publicar o código.
 */
export const SOURCEMAP_BUILD = {
  sourcemap: 'hidden',
  rollupOptions: { output: { sourcemapExcludeSources: true } }
} as const

export const SOURCEMAPS_DIR = resolve('sourcemaps')

/** Move cada .map de outDir para destDir, tirando o sourcesContent se vier. */
export function moveSourceMaps(outDir: string, fileNames: string[], destDir: string): string[] {
  const maps = fileNames.filter((name) => name.endsWith('.map'))
  if (maps.length > 0) mkdirSync(destDir, { recursive: true })
  return maps.map((name) => {
    const from = join(outDir, name)
    const map = JSON.parse(readFileSync(from, 'utf8')) as { sourcesContent?: unknown }
    delete map.sourcesContent
    const to = join(destDir, basename(name))
    writeFileSync(to, JSON.stringify(map))
    unlinkSync(from)
    return to
  })
}

export function sourceMapsOutPlugin(destDir = SOURCEMAPS_DIR): Plugin {
  return {
    name: 'salinha-sourcemaps-out',
    apply: 'build',
    writeBundle(options, bundle) {
      if (options.dir) moveSourceMaps(options.dir, Object.keys(bundle), destDir)
    }
  }
}

export function rendererShared(
  ...extraPlugins: Plugin[]
): Pick<UserConfig, 'resolve' | 'plugins' | 'assetsInclude'> {
  return {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss(), fontLicensePlugin, sourceMapsOutPlugin(), ...extraPlugins],
    // O WASM do RNNoise entra inline (lib/noiseSuppression.ts).
    assetsInclude: ['**/*.wasm', '**/*.tflite']
  }
}

/**
 * A versão do app no renderer (import.meta.env.VITE_APP_VERSION): o app web
 * não tem preload para perguntar. O deploy passa VITE_APP_VERSION (a versão
 * calculada antes de subir o package.json); sem ela, a do package.json.
 */
export function appVersionDefine(): Record<string, string> {
  const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8')) as { version: string }
  return {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(
      buildVersion(process.env.VITE_APP_VERSION, pkg.version)
    )
  }
}
