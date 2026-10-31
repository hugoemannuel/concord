/** SSS: a janela treme uma vez no slam (a classe no <body> ativa o keyframe). Devolve o cancelamento. */
export function startQuake(durationMs = 600): () => void {
  document.body.classList.add('boost-quake')
  const timer = setTimeout(() => document.body.classList.remove('boost-quake'), durationMs)
  return () => {
    clearTimeout(timer)
    document.body.classList.remove('boost-quake')
  }
}
