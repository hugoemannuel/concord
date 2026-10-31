import type { CallUserInfo } from '../store/callStore'
import { useCallStore } from '../store/callStore'
import { useAnnotationStore } from '../store/annotationStore'
import ScreenAnnotationCanvas from './ScreenAnnotationCanvas'
import ScreenAnnotationToolbar from './ScreenAnnotationToolbar'

/** Camada de desenho da transmissão (Epic Pen) e a barra de ferramentas quando ativa. */
export default function ScreenAnnotations({ user }: { user: CallUserInfo }): React.JSX.Element {
  const callId = useCallStore((s) => s.callId) ?? ''
  const isDrawing = useAnnotationStore((s) => Boolean(s.drawingActive[user.id]))
  const toggleDrawing = useAnnotationStore((s) => s.toggleDrawing)
  return (
    <>
      <ScreenAnnotationCanvas sharerId={user.id} callId={callId} isDrawingMode={isDrawing} />
      {isDrawing && (
        <ScreenAnnotationToolbar
          sharerId={user.id}
          callId={callId}
          onClose={() => toggleDrawing(user.id)}
          className="absolute bottom-12 left-1/2 -translate-x-1/2"
        />
      )}
    </>
  )
}
