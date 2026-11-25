/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Endereço público do servidor da Salinha, ex.: http://abc.gl.at.ply.gg:12345 */
  readonly VITE_SERVER_URL?: string
  /** 'web' no build do navegador (vite.web.config.ts); ausente no desktop. */
  readonly VITE_APP_TARGET?: string
  /** Versão do app no build (vite.renderer.shared.ts: deploy ou package.json). */
  readonly VITE_APP_VERSION?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
