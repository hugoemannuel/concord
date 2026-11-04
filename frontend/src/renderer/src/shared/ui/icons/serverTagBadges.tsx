// Emblemas da tag do servidor: desenho próprio da Salinha, preenchidos, na cor que
// o servidor escolher (vem do pai, como os outros ícones). Os ids são os que o
// backend aceita (internal/serverprofile/validate.go).
import { Icon, type IconProps } from './Icon'

type BadgeDraw = React.JSX.Element

const DRAWINGS: Record<string, { label: string; draw: BadgeDraw }> = {
  folha: { label: 'Folha', draw: <path d="M20 4c-9 0-15 4-15 11 0 1 .2 2 .5 3L3 20.5 4.5 22l2.5-2.5c1 .3 2 .5 3 .5 7 0 11-6 10-16zM8 16c2-4 5-6 8-7-3 2-5 4-7 8z" /> },
  espada: { label: 'Espada', draw: <path d="M21 3l-8.5 1.5L5.6 11.4l-1.7-1.7-1.4 1.4 3 3-3 3 2.8 2.8 3-3 3 3 1.4-1.4-1.7-1.7 6.9-6.9L19.5 3.5z" /> },
  coracao: { label: 'Coração', draw: <path d="M12 21C6 16 2.5 12.6 2.5 8.6 2.5 5.5 5 3.5 7.6 3.5c1.8 0 3.4.9 4.4 2.5 1-1.6 2.6-2.5 4.4-2.5 2.6 0 5.1 2 5.1 5.1 0 4-3.5 7.4-9.5 12.4z" /> },
  chama: { label: 'Chama', draw: <path d="M12.5 2c.6 3.5-1.2 5.3-3 7.3C8 11 6 13 6 15.7 6 19.2 8.8 22 12 22s6-2.7 6-6.3c0-3-1.5-5-2.8-6.6-.5 1.3-1.2 2-2.2 2.5.6-3.2.3-6.6-.5-9.6z" /> },
  gota: { label: 'Gota', draw: <path d="M12 2.5S5 10.2 5 15a7 7 0 0 0 14 0c0-4.8-7-12.5-7-12.5z" /> },
  caveira: { label: 'Caveira', draw: <path d="M12 2.5c-5 0-8.5 3.5-8.5 8 0 2.8 1.3 5 3.5 6.4V20a1.5 1.5 0 0 0 1.5 1.5h7A1.5 1.5 0 0 0 17 20v-3.1c2.2-1.4 3.5-3.6 3.5-6.4 0-4.5-3.5-8-8.5-8zM8.7 13.5a2 2 0 1 1 0-4 2 2 0 0 1 0 4zm6.6 0a2 2 0 1 1 0-4 2 2 0 0 1 0 4z" /> },
  lua: { label: 'Lua', draw: <path d="M20.5 15.2A9 9 0 0 1 8.8 3.5a9 9 0 1 0 11.7 11.7z" /> },
  raio: { label: 'Raio', draw: <path d="M13.5 2 4.5 13.5h6L9.5 22l10-12.5h-6.5z" /> },
  cristal: { label: 'Cristal', draw: <path d="M7 3h10l5 6.5L12 22 2 9.5zM8 5 5.5 8.8h13L16 5z" /> },
  cogumelo: { label: 'Cogumelo', draw: <path d="M12 2.5C6.5 2.5 2.5 6.6 2.5 11c0 1.4 1 2.5 2.4 2.5h14.2c1.4 0 2.4-1.1 2.4-2.5 0-4.4-4-8.5-9.5-8.5zM8.6 15c-.4 2.3-.6 3.9-.6 4.9 0 1 .9 1.6 4 1.6s4-.6 4-1.6c0-1-.2-2.6-.6-4.9z" /> },
  estrela: { label: 'Estrela', draw: <path d="m12 2.5 2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z" /> },
  coroa: { label: 'Coroa', draw: <path d="M3 7.5 7.5 11 12 4l4.5 7L21 7.5 19 18H5zM5.5 19.5h13V21h-13z" /> },
  escudo: { label: 'Escudo', draw: <path d="M12 2.5 4 5.5V11c0 5 3.3 8.7 8 10.5 4.7-1.8 8-5.5 8-10.5V5.5z" /> },
  fantasma: { label: 'Fantasma', draw: <path d="M12 2.5A7.5 7.5 0 0 0 4.5 10v11l2.8-2 2.3 2 2.4-2 2.4 2 2.3-2 2.8 2V10A7.5 7.5 0 0 0 12 2.5zM9.2 11.5a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2zm5.6 0a1.6 1.6 0 1 1 0-3.2 1.6 1.6 0 0 1 0 3.2z" /> },
  pata: { label: 'Pata', draw: <path d="M12 11c-3 0-6 3.2-6 6.2C6 19.4 7.7 21 9.6 21c1 0 1.7-.5 2.4-.5s1.4.5 2.4.5c1.9 0 3.6-1.6 3.6-3.8 0-3-3-6.2-6-6.2zM5 8.5a2 2 0 1 0 0 4.2 2 2 0 0 0 0-4.2zm14 0a2 2 0 1 0 0 4.2 2 2 0 0 0 0-4.2zM9 3.5A2.1 2.1 0 1 0 9 7.7a2.1 2.1 0 0 0 0-4.2zm6 0a2.1 2.1 0 1 0 0 4.2 2.1 2.1 0 0 0 0-4.2z" /> },
  planeta: { label: 'Planeta', draw: <path d="M12 5.5a6.5 6.5 0 0 0-6.4 5.4C3.3 12.6 2 14 2.3 14.9c.4 1 2.6.9 5.8 0 2.2-.7 4.8-1.8 7.3-3.2 2.1-1.2 3.8-2.4 5-3.5-.7-.5-1.7-.5-3 0A6.5 6.5 0 0 0 12 5.5zm6.4 7.2c-2 1.3-4.3 2.4-6.5 3.2-1.3.5-2.5.8-3.6 1a6.5 6.5 0 0 0 10.1-4.2z" /> },
  foguete: { label: 'Foguete', draw: <path d="M21 3c-5-.4-9.5 1.7-12.3 6L5 9.8 2.5 13.3l4 .9L9.8 17.5l.9 4 3.5-2.5.8-3.7c4.3-2.8 6.4-7.3 6-12.3zM15 11a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM5.8 16.2C4.3 17 3.5 18.7 3 21c2.3-.5 4-1.3 4.8-2.8z" /> },
  dado: { label: 'Dado', draw: <path d="M6 3.5h12A2.5 2.5 0 0 1 20.5 6v12a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V6A2.5 2.5 0 0 1 6 3.5zM8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-4 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-4 4a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm8 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" /> },
  nota: { label: 'Nota musical', draw: <path d="M20 2.8 9 5v11.1A3.5 3.5 0 1 0 11 19V9.6l7-1.4v5.9a3.5 3.5 0 1 0 2 3.1z" /> },
  controle: { label: 'Controle', draw: <path d="M7.5 6h9c3 0 5 3 5.5 7.5.3 3-1 4.5-2.5 4.5-1.3 0-2.2-1-3-2.2l-.8-1.3H8.3l-.8 1.3C6.7 17 5.8 18 4.5 18 3 18 1.700 16.500 2 13.500 2.500 9 4.500 6 7.500 6zM8 8.500v1.500H6.500v1.500H8V13h1.500v-1.500H11V10H9.500V8.500zm8 .5a1.200 1.200 0 1 0 0 2.400 1.200 1.200 0 0 0 0-2.400z" /> }
}

export interface TagBadge {
  id: string
  label: string
}

/** Os emblemas, na ordem da grade. */
export const TAG_BADGES: readonly TagBadge[] = Object.entries(DRAWINGS).map(([id, { label }]) => ({ id, label }))

/** O emblema da tag; id desconhecido (versão mais nova do app) cai na estrela. */
export function TagBadgeIcon({ badge, ...props }: IconProps & { badge: string }): React.JSX.Element {
  return <Icon {...props}>{(DRAWINGS[badge] ?? DRAWINGS.estrela).draw}</Icon>
}
