import { playSound } from '../../call/lib/sounds'
import SectionHeader from '../../../shared/ui/SectionHeader'
import { choiceFor, withChoice } from '../lib/choice'
import { SOUND_EVENT_GROUPS } from '../lib/events'
import { useAppSoundsStore } from '../store/appSoundsStore'
import EventSoundRow from './EventSoundRow'

/** Os eventos por grupo, cada um com o seu seletor (ligado ao store). */
function EventSoundList(): React.JSX.Element {
  const settings = useAppSoundsStore((s) => s.settings)
  const custom = useAppSoundsStore((s) => s.custom)
  const busy = useAppSoundsStore((s) => s.busy)
  const error = useAppSoundsStore((s) => s.error)
  const { update, upload, removeCustom } = useAppSoundsStore.getState()

  return (
    <>
      {SOUND_EVENT_GROUPS.map((group) => (
        <div key={group.label} className="mt-4">
          <SectionHeader as="h4">{group.label}</SectionHeader>
          <ul className="divide-y divide-subtle">
            {group.events.map(({ id, label }) => (
              <EventSoundRow
                key={id}
                event={id}
                label={label}
                packId={settings.pack}
                choice={choiceFor(id, settings)}
                hasCustom={Boolean(custom[id])}
                busy={busy?.event === id ? busy.kind : null}
                error={error?.event === id ? error.message : null}
                onChoice={(choice) => update(withChoice(settings, id, choice))}
                onPreview={() => playSound(id)}
                onUpload={(file) => void upload(id, file)}
                onRemove={() => void removeCustom(id)}
              />
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

export default EventSoundList
