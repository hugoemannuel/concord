import { useCallSessionStore } from '../../call/store/callSessionStore'
import { createCallEventLog } from './callEventLog'
import { createConnectionProbe } from './connectionProbe'

// O registro dos eventos da voz é um só no app: a sonda (montada com a chamada, em callRuntime.ts) e a ponte da
// telemetria (useCallTelemetry) escrevem e leem o mesmo (docs/adr/0070).

export const callEventLog = createCallEventLog()

export const connectionProbe = createConnectionProbe(callEventLog, () => useCallSessionStore.getState().phase)
