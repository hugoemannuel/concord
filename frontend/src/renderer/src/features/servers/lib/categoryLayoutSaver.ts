import { saveCategoryLayout, type CategoryLayout } from '../api/categories'
import { createLayoutSaveQueue } from './layoutSaveQueue'

export interface LayoutSaveCallbacks {
  /** Terminou tudo: é hora de reler a lista. */
  onIdle: () => void
  /** Recusado: `confirmed` é a última organização que o servidor aceitou. */
  onFailed: (confirmed: CategoryLayout | null, err: unknown) => void
}

export interface CategoryLayoutSaver {
  /** A lista que acabou de ser lida: é para ela que se volta, e a revisão dela vai no pedido. */
  confirm: (layout: CategoryLayout) => void
  submit: (layout: CategoryLayout, callbacks: LayoutSaveCallbacks) => void
  busy: () => boolean
}

/** Gravação da organização de um servidor: fila, revisão e a volta atrás. */
export function createCategoryLayoutSaver(serverId: string): CategoryLayoutSaver {
  let confirmed: CategoryLayout | null = null
  let callbacks: LayoutSaveCallbacks | null = null
  const queue = createLayoutSaveQueue<CategoryLayout>({
    send: async (layout) => {
      const write = { categories: layout.categories.map((category) => category.id), channels: layout.channels }
      const { revision } = await saveCategoryLayout(serverId, write, confirmed?.revision ?? '')
      confirmed = { ...layout, revision }
    },
    onIdle: () => callbacks?.onIdle(),
    onFailed: (err) => callbacks?.onFailed(confirmed, err)
  })
  return {
    confirm: (layout) => {
      confirmed = layout
    },
    submit: (layout, next) => {
      callbacks = next
      queue.submit(layout)
    },
    busy: queue.busy
  }
}
