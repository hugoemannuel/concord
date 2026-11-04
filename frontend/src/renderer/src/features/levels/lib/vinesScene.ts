import type { SceneInput } from './milestoneScenes'
import { clamp01, easeInOut, easeOutBack, hexA, prog, type Scene } from './sceneKit'

interface Pt {
  x: number
  y: number
}

/** Escurece/apaga tudo no fim da cena. */
const tailFade = (t: number, d: number): number => 1 - prog(t, d * 0.82, d)

/** Ponto da curva de Bézier cúbica em `u`, escrito em `out`. */
function bezInto(c: readonly Pt[], u: number, out: Pt): Pt {
  const m = 1 - u
  const a = m * m * m
  const b = 3 * m * m * u
  const d = 3 * m * u * u
  const e = u * u * u
  out.x = a * c[0].x + b * c[1].x + d * c[2].x + e * c[3].x
  out.y = a * c[0].y + b * c[1].y + d * c[2].y + e * c[3].y
  return out
}

/** 30 · Esmeralda: vinhas crescem dos cantos, brotam folhas e o vento as varre. */
export function vinesScene(s: SceneInput, r: () => number, c0: CanvasRenderingContext2D): Scene {
  const { w, h } = s
  const P = (x: number, y: number): Pt => ({ x, y })
  const curves: Pt[][] = [
    [P(-20, h + 20), P(w * 0.15, h * 0.35), P(w * 0.35, h * 0.85), P(w * 0.48, h * 0.2)],
    [P(w + 20, h + 20), P(w * 0.85, h * 0.4), P(w * 0.62, h * 0.9), P(w * 0.54, h * 0.18)],
    [P(-20, h * 0.3), P(w * 0.2, h * 0.1), P(w * 0.25, h * 0.6), P(w * 0.4, h * 0.5)],
    [P(w + 20, h * 0.35), P(w * 0.8, h * 0.12), P(w * 0.75, h * 0.62), P(w * 0.6, h * 0.52)]
  ]
  // As curvas não mudam: os pontos do traço são calculados uma vez.
  const STEPS = 40
  const paths = curves.map((c) =>
    Array.from({ length: STEPS + 1 }, (_, k) => bezInto(c, k / STEPS, { x: 0, y: 0 }))
  )
  const tip: Pt = { x: 0, y: 0 }
  const grow = (t: number, i: number): number => easeInOut(prog(t, i * 120, 1300 + i * 120))
  const n = s.budget
  const a: Pt = { x: 0, y: 0 }
  const b: Pt = { x: 0, y: 0 }
  const leaves = Array.from({ length: n }, (_, i) => {
    const vine = i % curves.length
    const u = 0.08 + r() * 0.9
    bezInto(curves[vine], u, a)
    bezInto(curves[vine], Math.min(1, u + 0.01), b)
    return {
      vine,
      u,
      x: a.x,
      y: a.y,
      tangent: Math.atan2(b.y - a.y, b.x - a.x),
      side: i % 2 ? 1 : -1,
      size: 7 + r() * 7 + s.power * 4,
      vx: 0.35 + r() * 0.5,
      vy: -0.05 - r() * 0.15,
      wob: r() * Math.PI * 2,
      spin: (r() - 0.5) * 0.01,
      release: 1900 + r() * 500,
      color: r() < 0.7 ? s.color : s.colors[i % s.colors.length]
    }
  })
  // Rajada de vento: gradiente fixo em coordenadas locais, movido com translate.
  const wind = c0.createLinearGradient(-200, 0, 200, 0)
  wind.addColorStop(0, hexA(s.color, 0))
  wind.addColorStop(0.5, hexA(s.color, 0.16))
  wind.addColorStop(1, hexA(s.color, 0))
  return {
    particles: n,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      const vineAlpha = 1 - prog(t, 2100, 2900)
      ctx.lineCap = 'round'
      for (let i = 0; i < curves.length; i++) {
        const g = grow(t, i)
        if (g <= 0 || vineAlpha <= 0) continue
        const pts = paths[i]
        ctx.globalAlpha = 0.9 * vineAlpha
        for (let k = 1; k <= STEPS * g; k++) {
          ctx.beginPath()
          ctx.moveTo(pts[k - 1].x, pts[k - 1].y)
          ctx.lineTo(pts[k].x, pts[k].y)
          ctx.lineWidth = 9 * (1 - k / STEPS) + 2
          ctx.strokeStyle = k % 2 ? s.accent : s.color
          ctx.stroke()
        }
        // Gavinha enrolando na ponta.
        bezInto(curves[i], g, tip)
        ctx.beginPath()
        for (let k = 0; k < 16; k++) {
          const ang = k * 0.5
          const rad = 14 * (1 - k / 16)
          ctx.lineTo(tip.x + Math.cos(ang) * rad, tip.y + Math.sin(ang) * rad)
        }
        ctx.lineWidth = 2
        ctx.globalAlpha = vineAlpha * 0.8
        ctx.strokeStyle = s.color
        ctx.stroke()
      }
      for (const l of leaves) {
        const g = grow(t, l.vine)
        if (g < l.u) continue
        const pop = easeOutBack(clamp01((g - l.u) * 12))
        const lt = Math.max(0, t - l.release)
        const settle = Math.min(1, lt / 400)
        const x = l.x + l.vx * lt + Math.sin(l.wob + lt * 0.004) * 18 * settle
        const y = l.y + l.vy * lt + Math.cos(l.wob + lt * 0.003) * 10 * settle
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(l.tangent + l.side * 1.1 + l.spin * lt)
        ctx.scale(pop, pop)
        ctx.globalAlpha = fade
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.quadraticCurveTo(l.size * 0.6, -l.size * 0.45, l.size * 1.4, 0)
        ctx.quadraticCurveTo(l.size * 0.6, l.size * 0.45, 0, 0)
        ctx.fillStyle = l.color
        ctx.fill()
        ctx.globalAlpha = fade * 0.9
        ctx.strokeStyle = s.accent
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(0, 0)
        ctx.lineTo(l.size * 1.2, 0)
        ctx.stroke()
        ctx.restore()
      }
      const sweep = prog(t, 1900, 3000)
      if (sweep > 0 && sweep < 1) {
        ctx.save()
        ctx.translate(-s.w * 0.3 + sweep * s.w * 1.6, 0)
        ctx.globalAlpha = fade
        ctx.fillStyle = wind
        ctx.fillRect(-200, 0, 400, s.h)
        ctx.restore()
      }
      ctx.globalAlpha = 1
    }
  }
}
