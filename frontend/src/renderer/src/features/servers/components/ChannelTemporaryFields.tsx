import type { TemporarySettings } from '../lib/channelForm'
import ChannelDisappearingField from './ChannelDisappearingField'
import ChannelViewOnceField from './ChannelViewOnceField'

/** Os dois campos de mensagens temporárias do Editar canal. */
function ChannelTemporaryFields({
  value,
  onChange
}: {
  value: TemporarySettings
  onChange: (value: TemporarySettings) => void
}): React.JSX.Element {
  return (
    <>
      <ChannelDisappearingField
        value={value.disappearingSeconds}
        onChange={(disappearingSeconds) => onChange({ ...value, disappearingSeconds })}
      />
      <ChannelViewOnceField
        value={value.allowViewOnce}
        onChange={(allowViewOnce) => onChange({ ...value, allowViewOnce })}
      />
    </>
  )
}

export default ChannelTemporaryFields
