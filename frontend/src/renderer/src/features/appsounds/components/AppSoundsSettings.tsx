import { useAppSoundsStore } from '../store/appSoundsStore'
import EventSoundList from './EventSoundList'
import SoundPackPicker from './SoundPackPicker'
import SoundVolume from './SoundVolume'

/**
 * Configurações → Notificações → Sons: o pacote, o volume e o ajuste por
 * evento (outro pacote, áudio próprio ou nenhum som). Só muda o que você ouve.
 */
function AppSoundsSettings(): React.JSX.Element {
  const settings = useAppSoundsStore((s) => s.settings)
  const saveError = useAppSoundsStore((s) => (s.error?.event === null ? s.error.message : null))
  const update = useAppSoundsStore((s) => s.update)

  return (
    <section aria-labelledby="app-sounds-title" className="mt-4 rounded-xl border border-subtle bg-fg/5 p-4">
      <h3 id="app-sounds-title" className="text-ds-sm font-semibold text-strong">
        Sons
      </h3>
      <p className="mb-4 text-ds-sm text-muted">
        Escolha os sons que o app toca para você. Ninguém mais ouve a diferença.
      </p>
      <div className="flex flex-col gap-5">
        <SoundPackPicker
          value={settings.pack}
          volume={settings.volume}
          onChange={(pack) => update({ ...settings, pack })}
        />
        <SoundVolume value={settings.volume} onChange={(volume) => update({ ...settings, volume })} />
        {saveError && (
          <p role="alert" className="text-ds-sm text-danger">
            {saveError}
          </p>
        )}
        <div>
          <p className="text-ds-md font-medium text-strong">Ajustar por evento</p>
          <p className="text-ds-sm text-muted">
            Troque o som de um evento só, envie um áudio seu (MP3, OGG, WAV ou M4A, até 1 MB e 5 s) ou
            deixe sem som.
          </p>
          <EventSoundList />
        </div>
      </div>
    </section>
  )
}

export default AppSoundsSettings
