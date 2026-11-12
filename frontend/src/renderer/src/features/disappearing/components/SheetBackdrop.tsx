/** Fundo escuro da folha de baixo: tocar nele fecha a folha. */
function SheetBackdrop({ onClose }: { onClose: () => void }): React.JSX.Element {
  return <div aria-hidden="true" className="fixed inset-0 z-50 bg-black/50" onClick={onClose} />
}

export default SheetBackdrop
