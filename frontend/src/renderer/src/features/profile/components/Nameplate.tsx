import { API_BASE_URL } from '../../../shared/lib/config'
import { mediaLayers } from '../lib/cosmetics'

/**
 * Faixa (#482): a imagem atrás do nome, numa linha de lista. Fica por baixo do
 * conteúdo (a linha precisa de `relative` e o conteúdo vem depois, também
 * posicionado). Só o quadro parado é baixado; o GIF entra com a linha ativa
 * (hover/foco) e sai depois. O degradê da cor do fundo mantém o nome legível.
 */
function Nameplate({
  url,
  active,
  fade,
  forceAnimate = false
}: {
  url: string | null | undefined
  /** A linha está em hover/foco. */
  active: boolean
  /** Cor do fundo da lista (CSS), de onde sai o degradê. */
  fade: string
  /** Prévia "Animando": roda sem hover. */
  forceAnimate?: boolean
}): React.JSX.Element | null {
  const { still, moving } = mediaLayers(url, API_BASE_URL, {
    animate: forceAnimate ? 'always' : 'hover',
    active
  })
  if (!still) return null
  const layer = 'absolute inset-0 size-full object-cover'
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
    >
      <img src={still} alt="" draggable={false} loading="lazy" decoding="async" className={layer} />
      {moving && <img src={moving} alt="" draggable={false} className={layer} />}
      <span
        className="absolute inset-0"
        style={{ background: `linear-gradient(90deg, ${fade} 10%, transparent 80%)` }}
      />
    </span>
  )
}

export default Nameplate
