import { errorMessage } from '../../../shared/lib/errorMessage'
import { useEffect, useMemo, useState } from 'react'
import type { SoundboardItem } from '../api/soundboard'
import { useAuthStore } from '../../auth/store/authStore'
import { useServerStore } from '../../servers/store/serverStore'
import { useServerAccess } from '../../servers/hooks/useServerAccess'
import { Perm } from '../../servers/lib/permissions'
import { useVisit } from '../../guests/hooks/useGuestVisits'
import { useSoundboardStore } from '../store/soundboardStore'
import { useSoundFavoritesStore } from '../store/soundFavoritesStore'
import { soundboardLayout } from '../lib/soundboardSections'
import { useKeybindRecording } from '../hooks/useKeybindRecording'
import { showToast } from '../../../shared/store/toastStore'
import { FavoriteStarIcon } from '../../../shared/ui/icons'
import ExpressionPicker, {
  PickerSection,
  type PickerPreview,
  type PickerRailEntry
} from '../../emojis/components/ExpressionPicker'
import ServerBadge from '../../emojis/components/ServerBadge'
import type { PickerServer } from '../../emojis/lib/pickerSections'
import { soundPreview } from './soundPreview'
import SoundboardUploadModal from './SoundboardUploadModal'
import SoundboardHeader from './SoundboardHeader'
import SoundPad from './SoundPad'
import SoundboardEmpty from './SoundboardEmpty'
import { SoundboardSkeleton } from '../../../shared/ui/skeleton/layouts'

type PadSound = SoundboardItem & { server_name?: string }

const EMPTY_SOUNDS: SoundboardItem[] = []
const NO_SERVERS: PickerServer[] = []
const FAVORITES_ID = 'sound:favorites'
const GRID = 'grid grid-cols-2 gap-2'
const ROW_PX = 104
const HEADER_PX = 28
/** Seções montadas de cara; as outras quando chegam perto da área visível. */
const EAGER_SECTIONS = 3

const sectionId = (serverId: string): string => `sound:${serverId}`
const sectionHeight = (count: number): number => HEADER_PX + Math.max(Math.ceil(count / 2), 1) * ROW_PX

/** Os sons de todos os servidores da pessoa e os favoritos, em seções. */
function useSoundboardData(serverId: string, query: string) {
  const soundsByServer = useSoundboardStore((s) => s.soundsByServer)
  const loading = useSoundboardStore((s) => Boolean(s.loadingByServer[serverId]))
  const loadServerSounds = useSoundboardStore((s) => s.loadServerSounds)
  const loadMine = useSoundboardStore((s) => s.loadMine)
  const favorites = useSoundFavoritesStore((s) => s.favorites)
  const loadFavorites = useSoundFavoritesStore((s) => s.load)
  const servers = useServerStore((s) => s.servers) ?? NO_SERVERS
  const visit = useVisit(serverId)

  useEffect(() => {
    // O da chamada vem à parte: o visitante não é membro e não vem no /soundboard.
    void loadServerSounds(serverId)
    void loadMine()
    void loadFavorites()
  }, [serverId, loadServerSounds, loadMine, loadFavorites])

  const layout = useMemo(() => {
    const extraServers = visit ? [{ id: visit.server_id, name: visit.server_name, icon_url: visit.server_icon_url }] : []
    return soundboardLayout({ servers, extraServers, soundsByServer, favorites, currentId: serverId, search: query })
  }, [servers, visit, soundsByServer, favorites, serverId, query])

  return {
    ...layout,
    servers,
    visiting: visit !== null,
    favoriteList: favorites,
    // Já buscou este servidor alguma vez: reabrir mostra os sons na hora.
    waiting: loading && soundsByServer[serverId] === undefined,
    hasAny: (soundsByServer[serverId] ?? EMPTY_SOUNDS).length > 0 || favorites.length > 0
  }
}

/** O que a pessoa pode fazer na mesa desta chamada. */
function useSoundboardRights(serverId: string, visiting: boolean) {
  const meId = useAuthStore((s) => s.user?.id ?? '')
  // Só dá para conferir cargos do servidor aberto; em outro, o servidor decide.
  const viewingCallServer = useServerStore((s) => s.currentServer?.id === serverId)
  const access = useServerAccess()
  // Apagar áudio de outras pessoas: MANAGE_EXPRESSIONS (dono e administrador incluídos), só neste servidor.
  const canModerate = viewingCallServer && access.can(Perm.MANAGE_EXPRESSIONS)
  return {
    // Enviar som: ADD_SOUNDS no servidor da chamada (visitante não envia).
    canAdd: !visiting && (!viewingCallServer || access.can(Perm.ADD_SOUNDS)),
    canDelete: (snd: SoundboardItem): boolean =>
      snd.uploader_id === meId || (snd.server_id === serverId && canModerate)
  }
}

/** Mesa de áudio: favoritos e os sons de cada servidor da pessoa, com o trilho para pular entre eles. */
function SoundboardSoundsPanel({
  serverId,
  onBusyChange
}: {
  serverId: string
  /** Avisa o contêiner quando há modal ou gravação de atalho aberta (não fechar por fora). */
  onBusyChange: (busy: boolean) => void
}): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [uploadOpen, setUploadOpen] = useState(false)
  const data = useSoundboardData(serverId, query)
  const rights = useSoundboardRights(serverId, data.visiting)
  const { recordingSoundId, toggleRecording } = useKeybindRecording()

  const keybinds = useSoundboardStore((s) => s.keybinds)
  const activePlays = useSoundboardStore((s) => s.activePlays)
  const deleteSound = useSoundboardStore((s) => s.deleteSound)
  const triggerSound = useSoundboardStore((s) => s.triggerSound)
  const toggleFavorite = useSoundFavoritesStore((s) => s.toggle)

  useEffect(() => {
    onBusyChange(uploadOpen || recordingSoundId !== null)
    return () => onBusyChange(false)
  }, [uploadOpen, recordingSoundId, onBusyChange])

  const playingSoundIds = useMemo(() => new Set(Object.values(activePlays).map((p) => p.soundId)), [activePlays])
  const favoriteIds = useMemo(() => new Set(data.favoriteList.map((f) => f.id)), [data.favoriteList])
  const byId = useMemo(
    () => new Map<string, PadSound>([...data.sections.flatMap((s) => s.items), ...data.favorites].map((s) => [s.id, s])),
    [data.sections, data.favorites]
  )
  const serverOf = (id: string): PickerServer | undefined => data.sections.find((s) => s.server.id === id)?.server ?? data.servers.find((s) => s.id === id)

  const handleToggleFavorite = (sound: SoundboardItem): void => {
    toggleFavorite(sound.id).catch((err) => {
      showToast.error(errorMessage(err, 'Não foi possível favoritar o som.'))
    })
  }

  const handleDelete = async (sound: SoundboardItem): Promise<void> => {
    try {
      await deleteSound(sound.server_id, sound.id)
      showToast.info(`Som "${sound.name}" removido.`)
    } catch (err) {
      showToast.error(errorMessage(err, 'Não foi possível excluir o som.'))
    }
  }

  const renderPad = (snd: PadSound, showOrigin = false): React.JSX.Element => (
    <SoundPad
      key={snd.id}
      sound={snd}
      // Nos favoritos, o de outro servidor diz de onde é; nas seções, o título já diz.
      origin={showOrigin && snd.server_id !== serverId ? snd.server_name : undefined}
      isFavorite={favoriteIds.has(snd.id)}
      keybind={keybinds[snd.id]}
      recordingKey={recordingSoundId === snd.id}
      canDelete={rights.canDelete(snd)}
      isPlaying={playingSoundIds.has(snd.id)}
      onTrigger={() => triggerSound(snd.id)}
      onToggleFavorite={() => handleToggleFavorite(snd)}
      onStartRecordKey={() => toggleRecording(snd.id)}
      onDelete={() => void handleDelete(snd)}
    />
  )

  const rail: PickerRailEntry[] = [
    ...(data.favorites.length > 0
      ? [{ sectionId: FAVORITES_ID, label: 'Favoritos', icon: <FavoriteStarIcon size={20} filled className="text-warning" /> }]
      : []),
    ...data.sections.map((s) => ({
      sectionId: sectionId(s.server.id),
      label: s.server.name,
      icon: <ServerBadge name={s.server.name} iconUrl={s.server.icon_url} />
    }))
  ]

  const describe = (key: string): PickerPreview | null => {
    const sound = byId.get(key)
    return soundPreview(sound, sound && serverOf(sound.server_id))
  }

  const nothingShown = data.favorites.length === 0 && data.sections.every((s) => s.items.length === 0)

  return (
    <>
      <ExpressionPicker
        rail={rail}
        header={<SoundboardHeader canAdd={rights.canAdd} query={query} onQuery={setQuery} onAdd={() => setUploadOpen(true)} />}
        describe={describe}
        idleHint="Passe o mouse ou toque em um som para ver de onde ele vem."
      >
        {data.waiting ? (
          <SoundboardSkeleton />
        ) : nothingShown ? (
          <SoundboardEmpty searching={data.hasAny || query.trim() !== ''} canAdd={rights.canAdd} />
        ) : (
          <>
            {data.favorites.length > 0 && (
              <PickerSection
                id={FAVORITES_ID}
                title="Favoritos"
                icon={<FavoriteStarIcon size={12} filled className="shrink-0" />}
                eager
                estimatedHeight={sectionHeight(data.favorites.length)}
              >
                <div className={GRID}>{data.favorites.map((s) => renderPad(s, true))}</div>
              </PickerSection>
            )}
            {data.sections
              .filter((s) => s.items.length > 0)
              .map((section, i) => (
                <PickerSection
                  key={section.server.id}
                  id={sectionId(section.server.id)}
                  title={section.server.name}
                  icon={<ServerBadge name={section.server.name} iconUrl={section.server.icon_url} size="xs" />}
                  eager={query.trim() !== '' || i < EAGER_SECTIONS}
                  estimatedHeight={sectionHeight(section.items.length)}
                >
                  <div className={GRID}>{section.items.map((s) => renderPad(s))}</div>
                </PickerSection>
              ))}
          </>
        )}
      </ExpressionPicker>

      <SoundboardUploadModal open={uploadOpen} serverId={serverId} onClose={() => setUploadOpen(false)} />
    </>
  )
}

export default SoundboardSoundsPanel
