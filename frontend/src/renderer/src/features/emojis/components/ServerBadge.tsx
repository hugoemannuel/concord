import { serverIconSrc } from '../../servers/lib/serverIcon'

const SIZE = {
  xs: 'size-4 text-ds-xxs',
  sm: 'size-5 text-ds-xxs',
  md: 'size-8 text-ds-xs'
} as const

/** Ícone do servidor ou, sem ele, a inicial do nome. */
export default function ServerBadge({
  name,
  iconUrl,
  size = 'md'
}: {
  name: string
  iconUrl?: string | null
  size?: keyof typeof SIZE
}): React.JSX.Element {
  const icon = serverIconSrc(iconUrl)
  const box = `flex shrink-0 items-center justify-center overflow-hidden rounded-md ${SIZE[size]}`
  if (icon) return <img src={icon} alt="" loading="lazy" decoding="async" className={`${box} object-cover`} />
  return (
    <span aria-hidden className={`${box} bg-fg/10 font-semibold text-normal`}>
      {name.slice(0, 1).toUpperCase()}
    </span>
  )
}
