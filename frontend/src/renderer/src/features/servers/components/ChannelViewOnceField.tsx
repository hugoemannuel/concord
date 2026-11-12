import Switch from '../../../shared/ui/Switch'

/** "Visualização única" no Editar canal: liga ou desliga o envio de foto/vídeo que abre uma vez. */
function ChannelViewOnceField({
  value,
  onChange
}: {
  value: boolean
  onChange: (value: boolean) => void
}): React.JSX.Element {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-subtle bg-fg/3 p-3">
      <div className="min-w-0">
        <p className="text-ds-md font-medium text-strong">Visualização única</p>
        <p className="text-ds-sm text-muted">
          Membros podem mandar fotos e vídeos que cada pessoa abre uma vez. Nem a moderação consegue
          abrir.
        </p>
      </div>
      <Switch checked={value} label="Visualização única" onChange={onChange} />
    </div>
  )
}

export default ChannelViewOnceField
