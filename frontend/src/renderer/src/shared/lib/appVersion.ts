// A versão do app que o build embute no renderer (VITE_APP_VERSION, definida em
// vite.renderer.shared.ts): no app web não há preload para perguntar. Puro, sem
// o Vite, para a config do build também usar.

/** A versão do build: a do deploy (VITE_APP_VERSION) ou a do package.json. */
export function buildVersion(fromEnv: string | undefined, fromPackage: string): string {
  return fromEnv?.trim() || fromPackage
}
