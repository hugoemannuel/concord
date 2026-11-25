import { useEffect } from 'react'
import { PANEL_ID, tabElementId } from '../lib/panelRoute'
import type { PanelTab } from '../lib/panelTabs'
import { nextTabIndex } from '../lib/tabKeys'

/**
 * Barra de abas do painel (padrão "Tabs" do WAI-ARIA, ativação automática):
 * setas, Home e End trocam de aba; só a aba ativa entra no Tab. No celular rola
 * na horizontal (o anel de foco fica por dentro para não ser cortado).
 */
export function PanelTabBar({
  tabs,
  active,
  onSelect
}: {
  tabs: PanelTab[]
  active: string
  onSelect: (id: string) => void
}): React.JSX.Element {
  // A aba ativa sempre à vista na barra (link direto para uma aba do fim, setas).
  useEffect(() => {
    document
      .getElementById(tabElementId(active))
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [active])
  const select = (id: string): void => {
    onSelect(id)
    document.getElementById(tabElementId(id))?.focus()
  }
  const onKeyDown = (e: React.KeyboardEvent, index: number): void => {
    const next = nextTabIndex(index, e.key, tabs.length)
    if (next === null) return
    e.preventDefault()
    select(tabs[next].id)
  }
  return (
    <div
      role="tablist"
      aria-label="Seções do painel"
      className="flex shrink-0 overflow-x-auto border-b border-subtle px-2"
    >
      {tabs.map((t, i) => (
        <button
          key={t.id}
          id={tabElementId(t.id)}
          type="button"
          role="tab"
          aria-selected={t.id === active}
          aria-controls={PANEL_ID}
          tabIndex={t.id === active ? 0 : -1}
          onClick={() => select(t.id)}
          onKeyDown={(e) => onKeyDown(e, i)}
          className={`focus-ring-inset flex min-h-11 shrink-0 cursor-pointer items-center whitespace-nowrap border-b-2 px-3 text-ds-sm font-medium transition-colors ${
            t.id === active
              ? 'border-brand text-strong'
              : 'border-transparent text-muted hover:text-normal'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
