import Modal from '../../../shared/ui/Modal'
import Button from '../../../shared/ui/Button'
import type { WhatsNewGroup } from '../lib/whatsNew'

interface ContentProps {
  groups: WhatsNewGroup[]
  onClose(): void
  onSeeAll(): void
}

function Items({ title, items }: { title?: string; items: string[] }): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <div className="mt-2">
      {title && <p className="text-ds-xs font-semibold text-muted">{title}</p>}
      <ul className="mt-1 list-disc space-y-1 pl-5 text-ds-sm text-normal">
        {items.map((text, i) => (
          <li key={i} className="break-words">
            {text}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Corpo do modal de novidades: os destaques de cada versão desde a última vista. */
export function WhatsNewContent({ groups, onClose, onSeeAll }: ContentProps): React.JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g.version}>
          <h3 className="text-ds-md font-semibold text-strong">v{g.version}</h3>
          <Items items={g.features} />
          <Items title="Correções" items={g.fixes} />
        </section>
      ))}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="w-full sm:w-auto" onClick={onSeeAll}>
          Ver todas as novidades
        </Button>
        <Button className="w-full sm:w-auto" onClick={onClose}>
          Entendi
        </Button>
      </div>
    </div>
  )
}

/** Aparece uma vez depois de atualizar, com as notas marcadas como destaque (ADR 0066). */
function WhatsNewModal(props: ContentProps): React.JSX.Element {
  return (
    <Modal open title="Novidades da Salinha" onClose={props.onClose}>
      <WhatsNewContent {...props} />
    </Modal>
  )
}

export default WhatsNewModal
