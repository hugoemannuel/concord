import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACTIVE_WINDOW } from '../../../../../../shared/windowActivity'
import { useWindowActivityStore } from '../../../../shared/store/windowActivityStore'
import { watchWindowActivity, windowFocused, windowVisible } from './windowSignal'

const set = (visible: boolean, focused: boolean): void =>
  useWindowActivityStore.getState().setActivity({ visible, focused })

afterEach(() => useWindowActivityStore.getState().setActivity(ACTIVE_WINDOW))

// No desktop em call o main desliga o backgroundThrottling e a Page Visibility
// diz "visível" sempre: quem sabe da janela é o store (o main o alimenta).
describe('windowSignal', () => {
  it('minimizada ou na bandeja: nem visível nem com foco', () => {
    set(false, false)
    expect([windowVisible(), windowFocused()]).toEqual([false, false])
  })

  it('visível sem foco (atrás do jogo, noutro monitor) conta como visível', () => {
    set(true, false)
    expect([windowVisible(), windowFocused()]).toEqual([true, false])
  })

  it('foco sem estar visível não vale como foco', () => {
    set(false, true)
    expect(windowFocused()).toBe(false)
  })

  it('avisa quando o estado da janela muda, até desligar', () => {
    const onChange = vi.fn()
    const stop = watchWindowActivity(onChange)
    set(false, false)
    expect(onChange).toHaveBeenCalledTimes(1)
    stop()
    set(true, true)
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
