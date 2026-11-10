import { useCastigoMenu, type CastigoMenuTarget } from '../hooks/useCastigoMenu'
import { CASTIGO_COPY } from '../lib/castigoCopy'

/** "Castigo…" e "Tirar castigo" no menu de um usuário (nada se não se aplica). */
function CastigoMenuItems({
  target,
  itemClass,
  close
}: {
  target: CastigoMenuTarget
  itemClass: string
  close: () => void
}): React.JSX.Element | null {
  const menu = useCastigoMenu(target)
  if (!menu.canOpen && !menu.canLift) return null
  return (
    <>
      <div className="my-1 h-px bg-fg/10" />
      {menu.canOpen && (
        <button
          role="menuitem"
          className={itemClass}
          onClick={() => {
            close()
            menu.open()
          }}
        >
          {CASTIGO_COPY.menuItem}
        </button>
      )}
      {menu.canLift && (
        <button
          role="menuitem"
          className={itemClass}
          onClick={() => {
            close()
            void menu.lift()
          }}
        >
          {CASTIGO_COPY.liftItem}
        </button>
      )}
    </>
  )
}

export default CastigoMenuItems
