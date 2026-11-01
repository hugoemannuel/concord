import type { ComponentType, CSSProperties } from 'react'
import type { IconProps } from '../../../../shared/ui/icons'
import SectionHeader from '../../../../shared/ui/SectionHeader'

// Controles compactos do editor de perfil: chips de escolha única, amostra
// de cor, régua curta e o bloco de seção. Alvo de toque ≥ 40 px.

// O rótulo quebra linha em vez de cortar ("Branco e vermelho" inteiro em 360 px).
const chipClass = (active: boolean): string =>
  `flex min-h-10 min-w-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1 text-center text-ds-xs font-medium transition-colors focus-ring ${
    active
      ? 'border-brand bg-brand/15 text-strong'
      : 'border-subtle bg-fg/5 text-secondary hover:bg-fg/10 hover:text-strong'
  }`

export interface ChipOption {
  id: string
  label: string
  /** Ícone do conjunto (shared/ui/icons), em 16 px; texto/emoji não entra. */
  icon?: ComponentType<IconProps>
  /** Só o ícone à mostra; o rótulo vira o nome acessível. */
  iconOnly?: boolean
  /** Estilo do rótulo (ex.: o nome da fonte escrito nela mesma). */
  labelStyle?: CSSProperties
}

function Chip({
  option: { id, label, icon: Icon, iconOnly, labelStyle },
  active,
  onPick
}: {
  option: ChipOption
  active: boolean
  onPick: (id: string) => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={iconOnly ? label : undefined}
      title={iconOnly ? label : undefined}
      className={chipClass(active)}
      onClick={() => onPick(id)}
    >
      {Icon && <Icon size={16} className="shrink-0" />}
      {!iconOnly && (
        <span className="min-w-0 break-words" style={labelStyle}>
          {label}
        </span>
      )}
    </button>
  )
}

/** Escolha única em chips (grade densa que quebra linha). */
export function ChipGroup({
  label,
  options,
  value,
  onPick,
  className = 'grid-cols-[repeat(auto-fill,minmax(5.5rem,1fr))]'
}: {
  label: string
  options: readonly ChipOption[]
  value: string
  onPick: (id: string) => void
  className?: string
}): React.JSX.Element {
  return (
    <div className={`grid gap-1.5 ${className}`} role="group" aria-label={label}>
      {options.map((o) => (
        <Chip key={o.id} option={o} active={value === o.id} onPick={onPick} />
      ))}
    </div>
  )
}

/** Amostra de cor clicável (abre o seletor nativo). */
export function ColorSwatch({
  label,
  value,
  onChange
}: {
  label: string
  value: string
  onChange: (color: string) => void
}): React.JSX.Element {
  return (
    <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-subtle bg-fg/5 py-1 pl-1 pr-2.5 text-ds-xs text-secondary transition-colors hover:bg-fg/10 focus-within:ring-2 focus-within:ring-brand">
      <span
        className="relative size-8 shrink-0 overflow-hidden rounded-md border border-normal"
        style={{ background: value }}
      >
        <input
          type="color"
          aria-label={label}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 size-full cursor-pointer opacity-0"
        />
      </span>
      <span className="truncate">{label}</span>
    </label>
  )
}

/** Régua curta com rótulo e o valor ao lado. */
export function RangeField({
  label,
  value,
  min,
  max,
  step = 1,
  display,
  onChange
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  display: string
  onChange: (value: number) => void
}): React.JSX.Element {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-ds-xs text-muted">
      <span className="flex items-baseline justify-between gap-2">
        <span>{label}</span>
        <span className="font-medium text-secondary">{display}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={display}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-10 w-full cursor-pointer accent-brand"
      />
    </label>
  )
}

/** Bloco de seção do editor: título, descrição curta e o conteúdo. */
export function EditorSection({
  title,
  description,
  aside,
  children
}: {
  title: string
  description?: string
  aside?: React.ReactNode
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="rounded-xl border border-subtle bg-fg/[0.03] p-3 sm:p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-ds-sm font-semibold text-strong">{title}</h3>
          {description && <p className="mt-0.5 text-ds-xs text-muted">{description}</p>}
        </div>
        {aside}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  )
}

/** Subtítulo pequeno dentro de uma seção. */
export function SubLabel({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <SectionHeader as="p">{children}</SectionHeader>
}
