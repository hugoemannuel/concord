import { useEffect, useLayoutEffect, useRef } from 'react'
import { bottomScrollPlan } from '../lib/scrollAnchor'
import {
  applyBottomScroll,
  isNearBottom,
  resizeTargets,
  shouldFollowGrowth
} from '../lib/stickToBottom'

/**
 * Lista de mensagens grudada no fim: abrir a sala deixa a lista já no fim, de
 * uma vez e antes de pintar (sem rolar na frente da pessoa). Depois disso,
 * mensagem nova rola suave, mas só se a pessoa estava no fim; rolada para
 * cima, a lista fica onde está.
 *
 * `stickToBottom` é do ChatPane (quem envia mensagem ou sai do fim o ajusta);
 * aqui ele é lido e atualizado a cada scroll. Devolve os refs da lista
 * (scroller, conteúdo e a marca do fim) e o onScroll.
 */
export function useStickToBottom({
  room,
  loading,
  total,
  stickToBottom: stickRef
}: {
  room: string
  loading: boolean
  /** Tudo que aparece no fim da lista: mensagens, pendentes e respostas efêmeras. */
  total: number
  stickToBottom: React.RefObject<boolean>
}): {
  scrollRef: React.RefObject<HTMLDivElement | null>
  contentRef: React.RefObject<HTMLDivElement | null>
  bottomRef: React.RefObject<HTMLDivElement | null>
  onScroll: (el: HTMLElement) => void
} {
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const positionedRoom = useRef<string | null>(null)
  const lastCount = useRef(0)
  const settleUntil = useRef(0)

  useLayoutEffect(() => {
    const plan = bottomScrollPlan({
      positionedRoom: positionedRoom.current,
      room,
      loading,
      stickToBottom: stickRef.current,
      countChanged: total !== lastCount.current
    })
    positionedRoom.current = plan.positionedRoom
    lastCount.current = total
    // Imagem e mídia que acabam de carregar empurram o fim: acompanha por
    // um instante, só se a pessoa ainda estiver no fim.
    const settle = applyBottomScroll(plan.scroll, scrollRef.current, Date.now())
    if (settle !== null) settleUntil.current = settle
  }, [room, loading, total, stickRef])

  // Conteúdo que cresce logo após abrir (imagens): mantém o fim à vista.
  useEffect(() => {
    const targets = resizeTargets(scrollRef.current, contentRef.current)
    if (!targets) return
    const observer = new ResizeObserver(() => {
      if (shouldFollowGrowth(Date.now(), settleUntil.current, stickRef.current)) {
        targets.scroller.scrollTop = targets.scroller.scrollHeight
      }
    })
    observer.observe(targets.content)
    return () => observer.disconnect()
  }, [loading, room, stickRef])

  const onScroll = (el: HTMLElement): void => {
    stickRef.current = isNearBottom(el)
  }

  return { scrollRef, contentRef, bottomRef, onScroll }
}
