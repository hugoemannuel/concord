// Validação do que vem do servidor antes de ir para o DOM: a cor vai num
// style e o id do YouTube numa URL de iframe (o backend já valida; aqui é a
// segunda trava).

const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i
const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/

/** A cor da faixa do cartão (theme-color do site), ou null para a cor neutra. */
export function safeEmbedColor(color: string | null | undefined): string | null {
  return color && HEX_COLOR.test(color) ? color : null
}

/**
 * Player do YouTube (domínio sem cookies), já tocando: só carrega depois do
 * clique no play, então o YouTube não vê quem só rolou o chat.
 */
export function youtubeEmbedSrc(id: string | null | undefined): string | null {
  if (!id || !YOUTUBE_ID.test(id)) return null
  return `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`
}
