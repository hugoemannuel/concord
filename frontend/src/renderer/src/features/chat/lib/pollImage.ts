// Imagem da resposta da enquete. O servidor baixa a imagem na criação e guarda
// "/api/poll-images/<uuid>"; o app nunca carrega a URL de fora (o site
// receberia o IP de quem vê a enquete). Enquete antiga, com URL de fora, fica
// sem imagem.

const POLL_IMAGE_PATH = /^\/api\/poll-images\/[0-9a-f-]{36}$/i

/**
 * Endereço para o <img>, ou null se a imagem não é a cópia do servidor.
 * `apiBase` é o API_BASE_URL: "http://host/api" no desktop, "/api" no
 * navegador (mesma origem).
 */
export function pollImageSrc(url: string | null | undefined, apiBase: string): string | null {
  if (!url || !POLL_IMAGE_PATH.test(url)) return null
  const origin = /^https?:\/\//.test(apiBase) ? new URL(apiBase).origin : ''
  return `${origin}${url}`
}
