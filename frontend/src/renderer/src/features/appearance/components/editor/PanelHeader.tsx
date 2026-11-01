import IconButton from '../../../../shared/ui/IconButton'
import { ChevronDownIcon, ChevronUpIcon, EyeIcon, GearIcon, RedoIcon, UndoIcon } from '../../../../shared/ui/icons'
import { useSettingsStore } from '../../../settings/store/settingsStore'
import { toggleSettingsView } from '../../store/themeEditorFlow'
import { useThemeEditorStore, type Draft } from '../../store/themeEditorStore'

/** Título, desfazer/refazer, "Ver o app" e recolher. */
export function PanelHeader({ draft, titleId }: { draft: Draft; titleId: string }): React.JSX.Element {
  const canUndo = useThemeEditorStore((s) => (s.history?.past.length ?? 0) > 0)
  const canRedo = useThemeEditorStore((s) => (s.history?.future.length ?? 0) > 0)
  const collapsed = useThemeEditorStore((s) => s.collapsed)
  const settingsOpen = useSettingsStore((s) => s.open)
  const { undo, redo, setCollapsed } = useThemeEditorStore.getState()
  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-subtle py-1.5 pr-1.5 pl-3">
      <h2 id={titleId} className="min-w-0 flex-1 truncate text-ds-sm font-semibold text-strong">
        {draft.isNew ? 'Novo tema' : 'Editar tema'}
        <span className="font-normal text-muted"> · {draft.name}</span>
      </h2>
      <IconButton icon={UndoIcon} label="Desfazer (Ctrl+Z)" disabled={!canUndo} onClick={undo} />
      <IconButton icon={RedoIcon} label="Refazer (Ctrl+Shift+Z)" disabled={!canRedo} onClick={redo} />
      <IconButton
        icon={settingsOpen ? EyeIcon : GearIcon}
        label={settingsOpen ? 'Ver o app' : 'Voltar às configurações'}
        onClick={toggleSettingsView}
      />
      <IconButton
        icon={collapsed ? ChevronUpIcon : ChevronDownIcon}
        label={collapsed ? 'Abrir o editor' : 'Recolher o editor'}
        aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)}
      />
    </div>
  )
}
