// Página da janelinha de abertura (ADR 0044): HTML estático montado aqui e
// carregado como data: URL — sem preload, sem Node, nada de fora (CSP). O main
// atualiza o texto chamando window.mostrar(...) com JSON e sabe do clique em
// "Abrir sem atualizar" pela troca do hash (navegação dentro da página).
import type { StartupView } from '../updates/startupFlow'
import {
  parseTitleBarColors,
  TITLE_BAR_COLOR,
  TITLE_BAR_SYMBOL_COLOR
} from '../window/windowPolicy'

export interface SplashColors {
  /** fundo (a cor da barra de título do tema) */
  color: string
  /** texto (a cor dos símbolos da barra) */
  symbolColor: string
}

export const SPLASH_SKIP_HASH = '#abrir-sem-atualizar'
/** Roxo do logo: aparece bem no tema escuro e no claro. */
const ACCENT = '#9563fb'
const DATA_IMAGE = /^data:image\/(png|svg\+xml);base64,[a-z0-9+/=]+$/i

/** Fundo escuro? (luminância relativa do hex #rrggbb) */
export function isDarkColor(hex: string): boolean {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.4
}

export function splashStatus(view: StartupView): string {
  switch (view.phase) {
    case 'checking':
      return 'Procurando atualizações…'
    case 'downloading':
      return `Baixando atualização… ${view.percent ?? 0}%`
    case 'installing':
      return 'Instalando…'
    case 'opening':
      return 'Abrindo…'
  }
}

/** O que o main roda na página para mostrar a fase (JSON: nada vira código). */
export function splashScript(view: StartupView): string {
  const payload = { status: splashStatus(view), percent: view.percent, canSkip: view.canSkip }
  return `window.mostrar(${JSON.stringify(payload)})`
}

/** A página navegou para o hash do botão: a pessoa quer abrir sem atualizar. */
export function wantsSkip(url: string): boolean {
  return url.endsWith(SPLASH_SKIP_HASH)
}

export function splashHtml(opts: { logo: string; colors: SplashColors }): string {
  const colors = parseTitleBarColors(opts.colors) ?? {
    color: TITLE_BAR_COLOR,
    symbolColor: TITLE_BAR_SYMBOL_COLOR
  }
  const title = isDarkColor(colors.color) ? '#f2f3f5' : '#060607'
  const logo = DATA_IMAGE.test(opts.logo)
    ? `<img class="logo" src="${opts.logo}" alt="" draggable="false">`
    : ''
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
<title>Salinha</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  html, body { height: 100%; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 16px; padding: 24px; overflow: hidden; user-select: none;
    background: ${colors.color}; color: ${colors.symbolColor};
    font: 14px/1.4 system-ui, 'Segoe UI', 'Noto Sans', sans-serif;
    -webkit-app-region: drag;
  }
  .logo { width: 96px; height: 96px; border-radius: 22px; animation: pulso 1.8s ease-in-out infinite; }
  .nome { font-size: 16px; font-weight: 600; color: ${title}; }
  #status { min-height: 1.4em; text-align: center; font-variant-numeric: tabular-nums; }
  .barra { width: 70%; height: 4px; border-radius: 999px; overflow: hidden;
    background: color-mix(in srgb, ${colors.symbolColor} 25%, transparent); visibility: hidden; }
  .barra.visivel { visibility: visible; }
  #progresso { height: 100%; width: 0; background: ${ACCENT}; transition: width .2s ease-out; }
  button {
    -webkit-app-region: no-drag; font: inherit; color: inherit; cursor: pointer;
    background: transparent; border: 1px solid color-mix(in srgb, ${colors.symbolColor} 45%, transparent);
    border-radius: 8px; padding: 6px 14px; min-height: 32px; visibility: hidden;
  }
  button.visivel { visibility: visible; }
  button:hover { background: color-mix(in srgb, ${colors.symbolColor} 12%, transparent); }
  button:focus-visible { outline: 2px solid ${ACCENT}; outline-offset: 2px; }
  @keyframes pulso { 50% { transform: scale(.94); opacity: .85; } }
  @media (prefers-reduced-motion: reduce) { .logo { animation: none; } #progresso { transition: none; } }
</style>
</head>
<body>
  ${logo}
  <p class="nome">Salinha</p>
  <p id="status" role="status" aria-live="polite">Procurando atualizações…</p>
  <div class="barra" id="barra" aria-hidden="true"><div id="progresso"></div></div>
  <button id="pular" type="button" tabindex="-1">Abrir sem atualizar</button>
<script>
  const pular = document.getElementById('pular')
  pular.addEventListener('click', () => { location.hash = '${SPLASH_SKIP_HASH}' })
  window.mostrar = (v) => {
    document.getElementById('status').textContent = v.status
    const barra = document.getElementById('barra')
    barra.classList.toggle('visivel', v.percent !== null)
    document.getElementById('progresso').style.width = (v.percent ?? 0) + '%'
    pular.classList.toggle('visivel', v.canSkip)
    pular.tabIndex = v.canSkip ? 0 : -1
  }
</script>
</body>
</html>`
}
