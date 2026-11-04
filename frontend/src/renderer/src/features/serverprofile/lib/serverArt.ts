// Fundos do banner e da faixa: a paleta de degradês próprios da Salinha ou uma
// imagem enviada. Os ids são os mesmos que o backend aceita
// (internal/serverprofile/validate.go). Puro.

import { profileMediaSrc } from '../../profile/lib/profileMedia'
import type { ServerArt } from '../api/serverProfile'

export interface ArtPreset {
  /** '' = o degradê padrão. */
  id: string
  label: string
  css: string
}

const sky = (top: string, middle: string, glow: string): string =>
  `radial-gradient(120% 90% at 50% 120%, ${glow} 0%, transparent 70%), linear-gradient(180deg, ${top} 0%, ${middle} 100%)`

export const ART_PRESETS: ArtPreset[] = [
  { id: '', label: 'Padrão', css: sky('#2b2d42', '#3a3f5c', '#6a7199') },
  { id: 'noite', label: 'Noite', css: sky('#0d0f16', '#191c28', '#4a4f66') },
  { id: 'rosa', label: 'Rosa', css: sky('#c2185b', '#e6467e', '#ffa3c7') },
  { id: 'vermelho', label: 'Vermelho', css: sky('#b3201f', '#dc3a32', '#ff9a85') },
  { id: 'laranja', label: 'Laranja', css: sky('#c75a12', '#ea7f24', '#ffc48a') },
  { id: 'amarelo', label: 'Amarelo', css: sky('#c99a10', '#e8bd2a', '#fff0a3') },
  { id: 'roxo', label: 'Roxo', css: sky('#5b2a9d', '#7c4dbd', '#c9a3f2') },
  { id: 'azul', label: 'Azul', css: sky('#0b6fc2', '#1f97e6', '#8fd6ff') },
  { id: 'turquesa', label: 'Turquesa', css: sky('#128a7f', '#2cbfae', '#a6f5ea') },
  { id: 'verde', label: 'Verde', css: sky('#2f6b1f', '#4d8f2e', '#a8d67e') },
  { id: 'cinza', label: 'Cinza', css: sky('#3a3b40', '#55565d', '#9a9ba3') }
]

/** Só o caminho que o nosso upload gera: nada que escape do url() do CSS. */
const SAFE_IMAGE = /^(\/api\/server-profile-images\/[0-9a-zA-Z-]+|blob:[^"\\]+)$/

function presetCss(id: string): string {
  return (ART_PRESETS.find((p) => p.id === id) ?? ART_PRESETS[0]).css
}

/** O CSS do fundo. `apiBase`: o API_BASE_URL (a imagem vem da origem dele). */
export function artBackground(art: ServerArt, apiBase: string): React.CSSProperties {
  if (SAFE_IMAGE.test(art.image)) {
    const src = profileMediaSrc(art.image, apiBase)
    return { backgroundImage: `url("${src}")`, backgroundSize: 'cover', backgroundPosition: 'center' }
  }
  return { backgroundImage: presetCss(art.preset) }
}

/** A faixa escolhida; null = o servidor não tem (o cabeçalho fica como sempre). */
export function resolveArt(art: ServerArt | undefined): ServerArt | null {
  return art && (art.preset || art.image) ? art : null
}
