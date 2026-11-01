/**
 * Fundo da janela: a cor do tema (--bg-app) e, nos temas com brilho (Preto
 * AMOLED, Roxo neon), bolhas de luz animadas atrás dos painéis de vidro. Nos
 * outros temas as bolhas nem renderizam (.app-decor em assets/themeDecor.css):
 * blur grande animado custa GPU à toa.
 */
function Background(): React.JSX.Element {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-app">
      {/* Temas próprios com vidro: o fundo principal (com degradê) atrás dos painéis. */}
      <div className="app-window-fill absolute inset-0" />
      <div className="app-decor absolute inset-0">
        <div className="animate-blob absolute -top-32 -left-32 h-144 w-xl rounded-full bg-hero-1/35 blur-[120px]" />
        <div className="animate-blob-slow absolute top-1/3 -right-40 h-120 w-120 rounded-full bg-hero-2/30 blur-[120px]" />
        <div className="animate-blob-fast absolute -bottom-40 left-1/3 h-152 w-152 rounded-full bg-hero-3/25 blur-[120px]" />
        <div className="animate-blob absolute top-1/2 left-2/3 h-112 w-md rounded-full bg-hero-4/20 blur-[110px]" />
        {/* Vinheta escura nas bordas, para o contraste do vidro. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_20%,rgba(3,4,6,0.85)_100%)]" />
      </div>
    </div>
  )
}

export default Background
