import { desktopCapturer } from 'electron'
import { listMinimizedWindows, pickerSources, type PickerSource } from './minimizedWindows'

/** O que o modal de seleção oferece: telas, janelas e as janelas minimizadas. */
export async function listPickerSources(): Promise<PickerSource[]> {
  const [sources, minimized] = await Promise.all([
    desktopCapturer.getSources({
      types: ['screen', 'window'],
      thumbnailSize: { width: 480, height: 270 },
      fetchWindowIcons: true
    }),
    listMinimizedWindows()
  ])
  const listed = sources.map((source) => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    appIcon: source.appIcon?.toDataURL() ?? null,
    displayId: source.display_id
  }))
  return pickerSources(listed, minimized)
}
