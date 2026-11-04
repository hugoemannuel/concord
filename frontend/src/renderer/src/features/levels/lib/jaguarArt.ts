/**
 * Desenho da cara da onça-pintada da cena do nível 14, em unidades do raio
 * da cabeça (o chamador faz translate + scale). De frente: orelhas redondas
 * de costas escuras, pelagem dourada com pintas sólidas na testa e rosetas
 * (anel quebrado com a pinta no meio) nas têmporas e bochechas, focinho
 * claro, "lágrimas" pretas saindo dos olhos. Olhos e boca ficam fora do
 * pré-desenho porque piscam e rugem.
 */

const TAU = Math.PI * 2

export const FUR = '#f0b54a'
const FUR_LIGHT = '#ffdc8f'
const FUR_DEEP = '#c47a1c'
const INK = '#1c1206'
const CREAM = '#fbf1dc'
const OCHRE = '#a8631a'
const NOSE = '#9a4f3c'
const IRIS = '#e9c23a'
const MOUTH = '#4a0d0d'
const TONGUE = '#c4485a'
const FANG = '#fffaf0'

/** Pintas sólidas da testa e das bochechas: [x, y, raio]; o lado esquerdo é espelhado. */
const SPOTS: readonly (readonly [number, number, number])[] = [
  [0, -0.64, 0.05],
  [0, -0.4, 0.035],
  [0.13, -0.68, 0.045],
  [0.09, -0.52, 0.04],
  [0.25, -0.54, 0.05],
  [0.19, -0.38, 0.032],
  [0.36, -0.42, 0.03],
  [0.62, 0.02, 0.045],
  [0.75, 0.2, 0.04],
  [0.56, 0.3, 0.032],
  [0.8, -0.12, 0.045],
  [0.46, 0.5, 0.03]
]

/** Rosetas grandes (anel quebrado + pinta no meio): [x, y, raio], espelhadas. */
export const ROSETTES: readonly (readonly [number, number, number])[] = [
  [0.52, -0.62, 0.1],
  [0.68, -0.3, 0.11],
  [0.82, 0.42, 0.1]
]

const SIDES = [-1, 1] as const

function disc(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  g.fillStyle = color
  g.beginPath()
  g.arc(x, y, r, 0, TAU)
  g.fill()
}

function oval(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  color: string
): void {
  g.fillStyle = color
  g.beginPath()
  g.ellipse(x, y, rx, ry, 0, 0, TAU)
  g.fill()
}

function drawEars(g: CanvasRenderingContext2D): void {
  for (const side of SIDES) {
    disc(g, side * 0.68, -0.7, 0.3, INK)
    disc(g, side * 0.68, -0.67, 0.23, FUR_DEEP)
    disc(g, side * 0.68, -0.63, 0.12, CREAM)
  }
}

/** Contorno da cabeça: testa larga, bochechas cheias e queixo arredondado. */
function headPath(g: CanvasRenderingContext2D): void {
  g.beginPath()
  g.moveTo(0, -0.86)
  g.bezierCurveTo(0.62, -0.88, 0.98, -0.52, 1, 0.04)
  g.bezierCurveTo(1.02, 0.52, 0.62, 0.88, 0, 0.9)
  g.bezierCurveTo(-0.62, 0.88, -1.02, 0.52, -1, 0.04)
  g.bezierCurveTo(-0.98, -0.52, -0.62, -0.88, 0, -0.86)
  g.closePath()
}

function drawSkull(g: CanvasRenderingContext2D): void {
  const grad = g.createRadialGradient(0, -0.25, 0.08, 0, 0.1, 1.05)
  grad.addColorStop(0, FUR_LIGHT)
  grad.addColorStop(0.55, FUR)
  grad.addColorStop(1, FUR_DEEP)
  g.fillStyle = grad
  headPath(g)
  g.fill()
  g.lineWidth = 0.035
  g.strokeStyle = INK
  g.stroke()
}

/** Roseta de onça: anel preto quebrado em 4, miolo ocre e a pinta no meio. */
export function rosette(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  disc(g, x, y, r * 0.75, OCHRE)
  g.strokeStyle = INK
  g.lineWidth = r * 0.42
  g.lineCap = 'round'
  for (let k = 0; k < 4; k++) {
    const a = (k * TAU) / 4 + 0.35
    g.beginPath()
    g.arc(x, y, r, a, a + TAU / 4 - 0.6)
    g.stroke()
  }
  disc(g, x, y, r * 0.22, INK)
}

function drawMarks(g: CanvasRenderingContext2D): void {
  for (const side of SIDES) {
    for (const [x, y, r] of SPOTS) disc(g, x * side, y, r, INK)
    for (const [x, y, r] of ROSETTES) rosette(g, x * side, y, r)
  }
}

function drawMuzzle(g: CanvasRenderingContext2D): void {
  g.strokeStyle = INK
  g.lineCap = 'round'
  g.lineWidth = 0.05
  for (const side of SIDES) {
    // "Lágrima": do canto de dentro do olho até o focinho.
    g.beginPath()
    g.moveTo(side * 0.2, -0.04)
    g.quadraticCurveTo(side * 0.22, 0.14, side * 0.36, 0.24)
    g.stroke()
    oval(g, side * 0.19, 0.4, 0.25, 0.19, CREAM)
  }
  oval(g, 0, 0.66, 0.2, 0.13, CREAM)
  for (const side of SIDES) {
    for (let i = 0; i < 3; i++) disc(g, side * (0.12 + i * 0.07), 0.38 + (i % 2) * 0.06, 0.014, INK)
  }
  g.fillStyle = NOSE
  g.beginPath()
  g.moveTo(-0.13, 0.13)
  g.quadraticCurveTo(0, 0.08, 0.13, 0.13)
  g.quadraticCurveTo(0.06, 0.27, 0, 0.29)
  g.quadraticCurveTo(-0.06, 0.27, -0.13, 0.13)
  g.fill()
}

function drawWhiskers(g: CanvasRenderingContext2D): void {
  g.strokeStyle = FANG
  g.lineWidth = 0.012
  for (const side of SIDES) {
    for (let i = 0; i < 3; i++) {
      g.beginPath()
      g.moveTo(side * 0.3, 0.4 + i * 0.05)
      g.quadraticCurveTo(side * 0.7, 0.32 + i * 0.1, side * 1.05, 0.3 + i * 0.16)
      g.stroke()
    }
  }
}

/** Tudo o que não se mexe: orelhas, cabeça, pintas, rosetas, focinho e bigodes. */
export function drawHead(g: CanvasRenderingContext2D): void {
  drawEars(g)
  drawSkull(g)
  drawMarks(g)
  drawMuzzle(g)
  drawWhiskers(g)
}

/** Amêndoa inclinada (canto de fora mais alto, olhar de felino). */
function almond(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  rx: number,
  ry: number,
  tilt: number
): void {
  g.save()
  g.translate(x, y)
  g.rotate(tilt)
  g.beginPath()
  g.moveTo(-rx, 0)
  g.quadraticCurveTo(0, -ry * 2, rx, 0)
  g.quadraticCurveTo(0, ry * 2, -rx, 0)
  g.fill()
  g.restore()
}

/** Centros dos olhos (unidades da cabeça). */
export const EYE_Y = -0.14
export const EYE_X = 0.36

/** Olhos dourados de pupila redonda; `open` 0 (fechado) a 1. */
export function drawEyes(g: CanvasRenderingContext2D, open: number): void {
  if (open <= 0.01) return
  for (const side of SIDES) {
    const x = side * EYE_X
    g.fillStyle = INK
    almond(g, x, EYE_Y, 0.2, 0.1 * open + 0.015, -side * 0.18)
    g.fillStyle = IRIS
    almond(g, x, EYE_Y, 0.165, 0.08 * open, -side * 0.18)
    oval(g, x, EYE_Y, 0.055, Math.min(0.06, 0.08 * open), INK)
    if (open > 0.5) disc(g, x - 0.045, EYE_Y - 0.03, 0.018, '#ffffff')
  }
}

function fang(g: CanvasRenderingContext2D, x: number, y: number, len: number): void {
  g.beginPath()
  g.moveTo(x - 0.035, y)
  g.lineTo(x + 0.035, y)
  g.lineTo(x, y + len)
  g.closePath()
  g.fill()
}

/** Boca: fechada é o traço em "ípsilon"; aberta (rugido) mostra língua e presas. */
export function drawMouth(g: CanvasRenderingContext2D, open: number): void {
  if (open <= 0.02) {
    g.strokeStyle = INK
    g.lineWidth = 0.035
    g.beginPath()
    g.moveTo(0, 0.29)
    g.lineTo(0, 0.4)
    g.moveTo(-0.18, 0.45)
    g.quadraticCurveTo(-0.05, 0.49, 0, 0.4)
    g.quadraticCurveTo(0.05, 0.49, 0.18, 0.45)
    g.stroke()
    return
  }
  const h = 0.32 * open
  const top = 0.4
  oval(g, 0, top + h / 2, 0.2 + 0.06 * open, h / 2 + 0.03, MOUTH)
  oval(g, 0, top + h * 0.78, 0.13 * open, h * 0.2, TONGUE)
  g.fillStyle = FANG
  for (const side of SIDES) {
    fang(g, side * 0.12, top - 0.01, 0.13 * open)
    fang(g, side * 0.1, top + h + 0.02, -0.09 * open)
  }
}
