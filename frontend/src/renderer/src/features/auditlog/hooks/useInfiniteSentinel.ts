import { useEffect, useEffectEvent, useRef } from 'react'

/**
 * Chama onVisible quando o sentinela (o fim da lista) aparece na tela. Refeito
 * a cada página (resetKey): se a lista é curta e o fim continua à vista, já
 * pede a próxima.
 */
export function useInfiniteSentinel(
  enabled: boolean,
  resetKey: number,
  onVisible: () => void
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null)
  const visible = useEffectEvent(onVisible)

  useEffect(() => {
    const target = ref.current
    if (!enabled || !target || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) visible()
      },
      { rootMargin: '200px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [enabled, resetKey])

  return ref
}
