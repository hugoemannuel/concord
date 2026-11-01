/**
 * No Windows e no Linux o app desenha a própria barra de título (a moldura
 * nativa fica escondida; os botões de minimizar/maximizar/fechar continuam
 * nativos, pintados com a cor do app). No macOS e no navegador, não.
 */
export function hasCustomTitleBar(platform: string | undefined): boolean {
  return platform === 'win32' || platform === 'linux'
}

export function currentPlatform(): string | undefined {
  return typeof window === 'undefined' ? undefined : window.api?.platform
}
