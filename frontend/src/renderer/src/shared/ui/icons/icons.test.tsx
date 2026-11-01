import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import * as icons from './index'
import type { IconProps } from './Icon'

const RENDERER = path.resolve(__dirname, '../../..')
const BASES = ['Icon', 'LineIcon', 'SlashedIcon']
const ICONS = Object.entries(icons).filter(
  ([name]) => name.endsWith('Icon') && !BASES.includes(name)
) as [string, ComponentType<IconProps>][]

/** Nomes importados de shared/ui/icons em todo o renderer (fora desta pasta). */
function importedNames(): Set<string> {
  const names = new Set<string>()
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (full !== __dirname) walk(full)
      } else if (/\.tsx?$/.test(entry.name)) {
        const src = readFileSync(full, 'utf8')
        for (const m of src.matchAll(
          /import\s*\{([^}]*)\}\s*from\s*'(?:[\w./]*\/ui|\.)\/icons'/g
        )) {
          for (const n of m[1].split(',')) {
            // Tipos (`type IconProps`) não existem em tempo de execução: o typecheck cobre.
            const name = n.split(' as ')[0].trim()
            if (name && !name.startsWith('type ')) names.add(name)
          }
        }
      }
    }
  }
  walk(RENDERER)
  return names
}

describe('shared/ui/icons', () => {
  it('reexporta todos os nomes que o app importa', () => {
    const missing = [...importedNames()].filter((n) => !(n in icons))
    expect(missing).toEqual([])
  })

  it('não tem mais os ícones mortos', () => {
    for (const dead of [
      'DiscordLogoIcon',
      'NitroIcon',
      'ShopIcon',
      'QuestsIcon',
      'CompassIcon',
      'InboxIcon'
    ]) {
      expect(dead in icons, dead).toBe(false)
    }
  })

  it.each(ICONS)('%s: tamanho padrão 20, escondido do leitor de tela', (_, Icon) => {
    const html = renderToStaticMarkup(<Icon />)
    expect(html).toMatch(/^<svg[^>]* width="20" height="20"/)
    expect(html).toContain('aria-hidden="true"')
  })

  it.each(ICONS)('%s: aceita os tamanhos da escala e a classe', (_, Icon) => {
    const html = renderToStaticMarkup(<Icon size={16} className="text-muted" />)
    expect(html).toMatch(/^<svg[^>]* width="16" height="16"/)
    expect(html).toContain('class="text-muted"')
  })
})

/** Símbolos feitos de linha (setas, chevrons, ×, ✓, +, #, @): os únicos de traço. */
const LINE_GLYPHS = [
  'ArrowLeftIcon',
  'ArrowUpIcon',
  'AtIcon',
  'CheckIcon',
  'ChevronDownIcon',
  'ChevronRightIcon',
  'ChevronUpIcon',
  'FullscreenExitIcon',
  'FullscreenIcon',
  'HashIcon',
  'MinusIcon',
  'PaperclipIcon',
  'PlusIcon',
  'ReplyIcon',
  'SlashIcon',
  'UndoIcon',
  'RedoIcon',
  'XIcon'
]

describe('estilo preenchido (como o Discord)', () => {
  it.each(ICONS)(
    '%s: preenchido com currentColor, ou traço só nos símbolos de linha',
    (name, Icon) => {
      const root = renderToStaticMarkup(<Icon />).match(/^<svg[^>]*>/)![0]
      if (LINE_GLYPHS.includes(name)) {
        expect(root).toContain('stroke="currentColor"')
        expect(root).toContain('stroke-width="2"')
      } else {
        expect(root).toContain('fill="currentColor"')
        expect(root).not.toContain('stroke=')
      }
    }
  )

  it('não há desenho repetido: nomes da mesma coisa apontam para o mesmo ícone', () => {
    const byMarkup = new Map<string, ComponentType<IconProps>>()
    for (const [name, Icon] of ICONS) {
      const html = renderToStaticMarkup(<Icon />).replace(/id="[^"]*"|url\(#[^)]*\)/g, '')
      const seen = byMarkup.get(html)
      if (seen) expect(seen, `${name} repete outro desenho`).toBe(Icon)
      else byMarkup.set(html, Icon)
    }
  })

  it.each([
    ['PhoneOffIcon', 'HangUpIcon'],
    ['FavoriteStarIcon', 'StarIcon'],
    ['MoreIcon', 'DotsIcon'],
    ['OnlineIcon', 'UserIcon'],
    ['MembersIcon', 'FriendsIcon'],
    ['ActivityIcon', 'GamepadIcon'],
    ['ChangelogIcon', 'SparkleIcon'],
    ['LaserIcon', 'BoltIcon']
  ])('%s é o mesmo desenho de %s', (alias, canonical) => {
    expect(icons[alias as keyof typeof icons]).toBe(icons[canonical as keyof typeof icons])
  })

  it('a versão "desligada" é a mesma figura com o risco por cima', () => {
    for (const [off, on] of [
      ['MicOffIcon', 'MicIcon'],
      ['HeadsetOffIcon', 'HeadsetIcon'],
      ['CameraOffIcon', 'CameraIcon'],
      ['VolumeOffIcon', 'VolumeIcon'],
      ['EyeOffIcon', 'EyeIcon']
    ] as const) {
      const Off = icons[off]
      const On = icons[on]
      const inner = renderToStaticMarkup(<On />).replace(/^<svg[^>]*>|<\/svg>$/g, '')
      expect(renderToStaticMarkup(<Off />), off).toContain(inner)
    }
  })
})
