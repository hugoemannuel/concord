// Imagem de fundo de um tema próprio (ADR 0043): só a enviada pelo próprio app
// ("/api/app-theme-images/<uuid>"), nunca URL de fora nem texto que escape do
// url() do CSS. Puro.

const IMAGE = /^\/api\/app-theme-images\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export function isThemeImage(value: unknown): value is string {
  return typeof value === 'string' && IMAGE.test(value)
}

/**
 * Origem das imagens a partir do API_BASE_URL: "http://host/api" no desktop
 * vira "http://host"; "/api" no navegador (mesma origem) vira "".
 */
export function imageOrigin(apiBase: string): string {
  return /^https?:\/\//.test(apiBase) ? new URL(apiBase).origin : ''
}

/** Endereço da imagem para o CSS; '' se não é uma imagem do app. */
export function themeImageSrc(image: string, origin: string): string {
  return isThemeImage(image) ? `${origin}${image}` : ''
}
