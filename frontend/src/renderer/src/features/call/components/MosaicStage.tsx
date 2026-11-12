import type { ReactNode } from 'react'
import type { CallPerson } from '../lib/callParticipants'
import type { ScreenEntry } from '../lib/screenWatch'
import { mosaicRest, type CameraEntry } from '../lib/stagePeople'
import type { CallUserInfo } from '../store/callStore'
import { useParticipantStripStore } from '../store/participantStripStore'
import ParticipantStrip from './ParticipantStrip'
import { MeTile, PersonTile, ScreenTile } from './StageTiles'
import StreamMosaic from './StreamMosaic'

/**
 * Sem foco selecionado: mosaico com as telas e as câmeras (cada uma é um
 * bloco: "screen:<id>" / "camera:<id>") + quem não tem vídeo embaixo, numa
 * faixa que dá para ocultar (mesma preferência do modo foco).
 */
function MosaicStage({
  screens,
  cameras,
  meId,
  meInfo,
  people,
  nameOf,
  speaking
}: {
  screens: ScreenEntry[]
  cameras: CameraEntry[]
  meId: string
  meInfo: CallUserInfo
  people: CallPerson[]
  nameOf: (userId: string) => CallUserInfo
  speaking?: Set<string>
}): React.JSX.Element {
  const tiles = new Map<string, { label: string; node: ReactNode }>([
    ...screens.map(
      (entry) =>
        [
          `screen:${entry.userId}`,
          {
            label: `${nameOf(entry.userId).display_name} (tela)`,
            node: <ScreenTile entry={entry} user={nameOf(entry.userId)} size="fill" />
          }
        ] as const
    ),
    ...cameras.map(
      ({ userId, stream }) =>
        [
          `camera:${userId}`,
          {
            label: `${nameOf(userId).display_name} (câmera)`,
            node:
              userId === meId ? (
                <MeTile info={meInfo} speaking={speaking} size="fill" video={stream} />
              ) : (
                <PersonTile user={nameOf(userId)} speaking={speaking} size="fill" video={stream} />
              )
          }
        ] as const
    )
  ])
  const rest = mosaicRest(screens, cameras, meId, people)
  // Mesma preferência do modo foco: ocultou lá, fica oculto aqui também.
  const stripHidden = useParticipantStripStore((s) => s.hidden)
  const toggleStrip = useParticipantStripStore((s) => s.toggle)

  return (
    <div className="flex h-full w-full flex-col gap-4">
      <StreamMosaic
        ids={[...tiles.keys()]}
        nameOf={(key) => tiles.get(key)?.label ?? ''}
        renderTile={(key) => tiles.get(key)?.node ?? null}
      />
      {rest.show && (
        <ParticipantStrip hidden={stripHidden} onToggle={toggleStrip}>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {rest.showMe && <MeTile info={meInfo} speaking={speaking} size="md" />}
            {rest.others.map((p) => (
              <PersonTile key={p.id} user={p} speaking={speaking} size="md" />
            ))}
          </div>
        </ParticipantStrip>
      )}
    </div>
  )
}

export default MosaicStage
