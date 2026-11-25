import { useCallback, useEffect, useReducer, useRef } from 'react'
import { useNow } from '../../../shared/hooks/useNow'
import { useErrorGroups } from '../hooks/useErrorGroups'
import {
  INITIAL_PANEL,
  panelReducer,
  type PanelAction,
  type PanelState
} from '../lib/errorPanelState'
import { ErrorFilters } from './ErrorFilters'
import { groupElementId } from '../lib/errorPanelFormat'
import { ErrorGroupList } from './ErrorGroupList'
import { ErrorGroupView } from './ErrorGroupView'
import { LoadGate } from './LoadGate'

/** Ao voltar à lista, o foco volta para o grupo que estava aberto. */
function useFocusReturn(open: string | null, listReady: boolean): (fingerprint: string) => void {
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (open !== null || !listReady || last.current === null) return
    document.getElementById(groupElementId(last.current))?.focus()
    last.current = null
  }, [open, listReady])
  return useCallback((fingerprint: string) => {
    last.current = fingerprint
  }, [])
}

/** A aba com os filtros e o grupo aberto vindos de fora (o teste monta cada estado). */
export function ErrorsPanel({
  days,
  panel,
  dispatch
}: {
  days: number
  panel: PanelState
  dispatch: (action: PanelAction) => void
}): React.JSX.Element {
  const now = useNow(60_000)
  const { state, reload } = useErrorGroups(days, panel.source, panel.version)
  const remember = useFocusReturn(panel.open, state.status === 'ready')
  const close = useCallback(() => {
    if (panel.open !== null) remember(panel.open)
    dispatch({ type: 'close' })
  }, [dispatch, panel.open, remember])
  if (panel.open !== null) {
    return <ErrorGroupView fingerprint={panel.open} days={days} now={now} onClose={close} />
  }
  return (
    <>
      <ErrorFilters
        source={panel.source}
        version={panel.version}
        versions={state.status === 'ready' ? state.data.versions : []}
        onSource={(source) => dispatch({ type: 'source', source })}
        onVersion={(version) => dispatch({ type: 'version', version })}
      />
      <LoadGate state={state} reload={reload}>
        {(report) => (
          <ErrorGroupList
            groups={report.groups}
            filtered={panel.source !== '' || panel.version !== ''}
            now={now}
            onOpen={(fingerprint) => dispatch({ type: 'open', fingerprint })}
          />
        )}
      </LoadGate>
    </>
  )
}

/** Aba Erros: os erros do app agrupados (desktop, web, Electron, Android e servidor). */
export default function ErrorsTab({ days }: { days: number }): React.JSX.Element {
  const [panel, dispatch] = useReducer(panelReducer, INITIAL_PANEL)
  return <ErrorsPanel days={days} panel={panel} dispatch={dispatch} />
}
