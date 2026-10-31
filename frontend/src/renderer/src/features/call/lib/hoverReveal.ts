/**
 * Controles sobre o vídeo da transmissão: com mouse só aparecem com o ponteiro
 * no tile (ou com foco de teclado dentro); em toque ficam sempre visíveis.
 * O ancestral precisa da classe `group/tile`.
 */
export const HOVER_REVEAL =
  'transition-opacity [@media(hover:hover)]:opacity-0 focus-within:opacity-100 [@media(hover:hover)]:group-hover/tile:opacity-100'
