import { RAINBOW, type MilestoneKind } from './levels'
import { VINES_IMPACT_MS, vinesScene } from './vinesScene'
import {
  rng,
  clamp01,
  prog,
  easeOut,
  easeIn,
  easeInOut,
  easeOutBack,
  window4,
  hexA,
  drawGlow,
  sparkle,
  type Scene
} from './sceneKit'

/**
 * Cenas das animações de marco (10, 20 … 100), desenhadas num <canvas> só
 * (sem um nó de DOM por partícula). Cada cena recebe o tamanho da janela e
 * quantas partículas pode usar (levelUpEffects.milestoneParticles) e devolve
 * uma função que desenha o quadro do instante `t` (ms desde o começo).
 */
export interface SceneInput {
  w: number
  h: number
  /** Nível redondo do marco (o número desenhado). */
  level: number
  /** Cor principal e escura da faixa. */
  color: string
  accent: string
  /** Cores das partículas (levelPalette). */
  colors: string[]
  /** Quantas partículas a cena pode criar. */
  budget: number
  /** Força do nível (levelIntensity.power): espalha mais no alto. */
  power: number
  durationMs: number
  /** Tamanho da fonte do número (o mesmo do título em DOM). */
  fontPx: number
  /** Centro da cena (o número fica aqui). */
  cx: number
  cy: number
}

/** Desenha o número numa tela escondida e devolve pontos dentro dele. */
function textPoints(
  text: string,
  fontPx: number,
  count: number,
  cx: number,
  cy: number,
  mode: 'fill' | 'outline'
): { x: number; y: number }[] {
  if (count <= 0) return []
  const pad = Math.ceil(fontPx * 0.1)
  const c = document.createElement('canvas')
  const g = c.getContext('2d', { willReadFrequently: true })
  if (!g) return []
  g.font = `900 ${fontPx}px system-ui, sans-serif`
  const width = Math.ceil(g.measureText(text).width) + pad * 2
  c.width = width
  c.height = Math.ceil(fontPx * 1.1) + pad * 2
  g.font = `900 ${fontPx}px system-ui, sans-serif`
  g.textBaseline = 'middle'
  g.textAlign = 'center'
  g.fillStyle = '#fff'
  g.fillText(text, c.width / 2, c.height / 2)
  const data = g.getImageData(0, 0, c.width, c.height).data
  const on = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < c.width && y < c.height && data[(y * c.width + x) * 4 + 3] > 128
  const step = Math.max(2, Math.round(fontPx / 40))
  const found: { x: number; y: number }[] = []
  for (let y = 0; y < c.height; y += step) {
    for (let x = 0; x < c.width; x += step) {
      if (!on(x, y)) continue
      if (mode === 'outline') {
        const edge = !on(x - step, y) || !on(x + step, y) || !on(x, y - step) || !on(x, y + step)
        if (!edge) continue
      }
      found.push({ x: x - c.width / 2 + cx, y: y - c.height / 2 + cy })
    }
  }
  if (found.length <= count) return found
  // Pega pontos espalhados por igual (não os primeiros da varredura).
  const out: { x: number; y: number }[] = []
  const stride = found.length / count
  for (let i = 0; i < count; i++) out.push(found[Math.floor(i * stride)])
  return out
}

/** Ordena os pontos como um caminho (vizinho mais próximo), para ligar as estrelas. */
function pathOrder(points: { x: number; y: number }[]): { x: number; y: number }[] {
  if (points.length < 3) return points
  const left = points.slice()
  left.sort((a, b) => a.x - b.x)
  const out = [left.shift()!]
  while (left.length) {
    const last = out[out.length - 1]
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < left.length; i++) {
      const d = (left[i].x - last.x) ** 2 + (left[i].y - last.y) ** 2
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    out.push(left.splice(best, 1)[0])
  }
  return out
}

/** Escurece/apaga tudo no fim da cena. */
const tailFade = (t: number, d: number): number => 1 - prog(t, d * 0.82, d)

// ---------- cenas ----------
//
// Regra para não alocar nada por quadro: cores são strings fixas (a
// transparência vai em ctx.globalAlpha), gradientes são criados uma vez na
// montagem (os que se mexem, em coordenadas locais + translate) e pontos
// temporários reaproveitam o mesmo objeto.

type Builder = (s: SceneInput, r: () => number, ctx: CanvasRenderingContext2D) => Scene

const WHITE = '#ffffff'
const WHITE_SOFT = 'rgba(255,255,255,.85)'
const WHITE_LINE = 'rgba(255,255,255,.7)'

interface Pt {
  x: number
  y: number
}

/** 10 · Prata: chuva de moedas girando, algumas estouram do centro. */
const coins: Builder = (s, r) => {
  const n = s.budget
  const size = 9 + 5 * s.power
  const g = 0.0018 * s.h
  const list = Array.from({ length: n }, (_, i) => {
    const burst = i % 3 === 0
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2
    const v = (0.4 + r() * 0.4) * (0.9 + s.power * 0.3)
    return {
      x0: burst ? s.cx : r() * s.w,
      y0: burst ? s.cy : -30 - r() * s.h * 0.6,
      vx: burst ? Math.cos(a) * v : (r() - 0.5) * 0.08,
      vy: burst ? Math.sin(a) * v : 0.15 + r() * 0.25,
      g: burst ? g : g * 0.25,
      delay: burst ? r() * 180 : r() * 900,
      spin: 0.006 + r() * 0.012,
      phase: r() * Math.PI * 2,
      size: size * (0.75 + r() * 0.5),
      color: s.colors[i % s.colors.length]
    }
  })
  return {
    particles: n,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      drawGlow(ctx, s.color, s.cx, s.cy, 220 + 120 * s.power, window4(t, 0, 120, 200, 900) * 0.7)
      for (const c of list) {
        const lt = t - c.delay
        if (lt < 0) continue
        const x = c.x0 + c.vx * lt
        const y = c.y0 + c.vy * lt + 0.5 * c.g * (lt / 1000) ** 2 * 1000
        if (y > s.h + 40) continue
        const flip = Math.cos(c.phase + lt * c.spin)
        ctx.save()
        ctx.translate(x, y)
        ctx.scale(Math.max(0.12, Math.abs(flip)), 1)
        ctx.globalAlpha = fade
        ctx.beginPath()
        ctx.arc(0, 0, c.size, 0, Math.PI * 2)
        ctx.fillStyle = flip > 0 ? c.color : s.accent
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = WHITE_SOFT
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(0, 0, c.size * 0.55, 0, Math.PI * 2)
        ctx.globalAlpha = fade * 0.8
        ctx.strokeStyle = s.accent
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
        // Brilho que passa na moeda quando ela fica de frente.
        if (flip > 0.92) sparkle(ctx, x - c.size * 0.3, y - c.size * 0.3, c.size, WHITE, fade)
      }
    }
  }
}

/** 20 · Ouro: anéis de choque dourados, raios e faíscas surfando a onda. */
const shockwave: Builder = (s, r) => {
  const n = s.budget
  const maxR = Math.hypot(s.w, s.h) * 0.62
  const rings = [0, 160, 330, 520]
  const sparks = Array.from({ length: n }, (_, i) => ({
    cos: 0,
    sin: 0,
    a: (i / n) * Math.PI * 2 + r() * 0.2,
    k: 0.75 + r() * 0.35,
    ring: i % 2,
    color: s.colors[i % s.colors.length],
    size: 2 + r() * 2.5
  }))
  for (const sp of sparks) {
    sp.cos = Math.cos(sp.a)
    sp.sin = Math.sin(sp.a)
  }
  const ringR = (t: number, start: number): number =>
    maxR * easeOut(prog(t, start + 100, start + 1500))
  return {
    particles: n,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      ctx.globalCompositeOperation = 'lighter'
      drawGlow(ctx, s.color, s.cx, s.cy, 160 + 160 * s.power, window4(t, 0, 90, 120, 700))
      // Raios de luz girando.
      const ra = window4(t, 0, 200, 900, 1800) * 0.22
      if (ra > 0) {
        ctx.save()
        ctx.translate(s.cx, s.cy)
        ctx.rotate(t * 0.0004)
        ctx.globalAlpha = ra
        ctx.fillStyle = s.color
        for (let i = 0; i < 14; i++) {
          ctx.rotate((Math.PI * 2) / 14)
          ctx.beginPath()
          ctx.moveTo(0, 0)
          ctx.lineTo(maxR, -maxR * 0.06)
          ctx.lineTo(maxR, maxR * 0.06)
          ctx.fill()
        }
        ctx.restore()
      }
      for (let i = 0; i < rings.length; i++) {
        const start = rings[i]
        const p = prog(t, start + 100, start + 1500)
        if (p <= 0 || p >= 1) continue
        const radius = ringR(t, start)
        ctx.beginPath()
        ctx.arc(s.cx, s.cy, radius, 0, Math.PI * 2)
        ctx.lineWidth = (18 - i * 3) * (1 - p) + 1
        ctx.globalAlpha = (1 - p) * 0.9 * fade
        ctx.strokeStyle = i % 2 ? WHITE : s.color
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(s.cx, s.cy, radius * 0.96, 0, Math.PI * 2)
        ctx.lineWidth = 2
        ctx.globalAlpha = (1 - p) * 0.6 * fade
        ctx.strokeStyle = s.accent
        ctx.stroke()
      }
      for (const sp of sparks) {
        const start = rings[sp.ring]
        const p = prog(t, start + 100, start + 1500)
        if (p <= 0 || p >= 1) continue
        const d = ringR(t, start) * sp.k
        const d0 = ringR(t - 40, start) * sp.k
        ctx.beginPath()
        ctx.moveTo(s.cx + sp.cos * d0, s.cy + sp.sin * d0)
        ctx.lineTo(s.cx + sp.cos * d, s.cy + sp.sin * d)
        ctx.lineWidth = sp.size
        ctx.globalAlpha = (1 - p) * fade
        ctx.strokeStyle = sp.color
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}

/** 40 · Safira: uma gota cai no meio, espirra e a água ondula com bolhas. */
const ripple: Builder = (s, r, c0) => {
  const impact = 460
  const splashN = Math.floor(s.budget * 0.35)
  const bubbleN = s.budget - splashN
  const maxR = Math.max(s.w, s.h) * 0.75
  const splash = Array.from({ length: splashN }, () => {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.4
    const v = 0.35 + r() * 0.55
    return { vx: Math.cos(a) * v, vy: Math.sin(a) * v, size: 2 + r() * 3 }
  })
  const bubbles = Array.from({ length: bubbleN }, () => ({
    x: r() * s.w,
    y0: s.h + 20 + r() * 80,
    v: 0.18 + r() * 0.3,
    wob: r() * Math.PI * 2,
    size: 3 + r() * 7,
    delay: impact + r() * 1400
  }))
  const waves = [0, 220, 440, 660, 880, 1500, 1700]
  const layers = [
    { k: 1, color: s.color, lw: 5 },
    { k: 0.94, color: WHITE, lw: 2 },
    { k: 0.86, color: s.accent, lw: 3 }
  ]
  // Tinta azul funda (força no globalAlpha).
  const tintGrad = c0.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, maxR)
  tintGrad.addColorStop(0, hexA(s.color, 0.6))
  tintGrad.addColorStop(1, hexA(s.accent, 1))
  return {
    particles: s.budget,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      const tint = window4(t, 0, 400, 2200, s.durationMs) * 0.32
      if (tint > 0) {
        ctx.globalAlpha = tint
        ctx.fillStyle = tintGrad
        ctx.fillRect(0, 0, s.w, s.h)
        ctx.globalAlpha = 1
      }
      // Gota caindo.
      if (t < impact) {
        const y = -40 + (s.cy + 40) * easeIn(t / impact)
        ctx.save()
        ctx.translate(s.cx, y)
        ctx.scale(1, 1.6)
        ctx.beginPath()
        ctx.arc(0, 0, 9, 0, Math.PI * 2)
        ctx.globalAlpha = 0.95
        ctx.fillStyle = WHITE
        ctx.fill()
        ctx.restore()
        drawGlow(ctx, s.color, s.cx, y, 40, 0.8)
      }
      // Gota menor que volta a cair (segunda ondulação).
      const bounce = prog(t, 900, 1500)
      if (bounce > 0 && bounce < 1) {
        ctx.beginPath()
        ctx.arc(s.cx, s.cy - Math.sin(bounce * Math.PI) * 120, 6, 0, Math.PI * 2)
        ctx.globalAlpha = 0.9 * fade
        ctx.fillStyle = WHITE
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'lighter'
      drawGlow(
        ctx,
        s.color,
        s.cx,
        s.cy,
        180 + 100 * s.power,
        window4(t, impact, impact + 80, impact + 100, impact + 700)
      )
      for (let i = 0; i < waves.length; i++) {
        const start = impact + waves[i]
        const p = prog(t, start, start + 1800)
        if (p <= 0 || p >= 1) continue
        const rx = maxR * easeOut(p) * (i >= 5 ? 0.6 : 1)
        ctx.globalAlpha = (1 - p) * fade * 0.9
        for (const layer of layers) {
          ctx.beginPath()
          ctx.ellipse(s.cx, s.cy, rx * layer.k, rx * layer.k * 0.36, 0, 0, Math.PI * 2)
          ctx.lineWidth = layer.lw * (1 - p) + 0.5
          ctx.strokeStyle = layer.color
          ctx.stroke()
        }
      }
      ctx.globalCompositeOperation = 'source-over'
      const lt = t - impact
      if (lt >= 0 && lt <= 1100) {
        ctx.globalAlpha = (1 - lt / 1100) * 0.95
        ctx.fillStyle = WHITE
        for (const d of splash) {
          ctx.beginPath()
          ctx.arc(s.cx + d.vx * lt, s.cy + d.vy * lt + 0.0009 * lt * lt, d.size, 0, Math.PI * 2)
          ctx.fill()
        }
      }
      for (const bb of bubbles) {
        const bt = t - bb.delay
        if (bt < 0) continue
        const y = bb.y0 - bb.v * bt
        if (y < -20) continue
        const x = bb.x + Math.sin(bb.wob + bt * 0.006) * 10
        ctx.beginPath()
        ctx.arc(x, y, bb.size, 0, Math.PI * 2)
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.7 * fade
        ctx.strokeStyle = WHITE
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(x - bb.size * 0.35, y - bb.size * 0.35, bb.size * 0.25, 0, Math.PI * 2)
        ctx.globalAlpha = 0.8 * fade
        ctx.fillStyle = WHITE
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
  }
}

/** 50 · Ametista: cristais voam das bordas e montam o número, brilham e estilhaçam. */
const crystals: Builder = (s, r, c0) => {
  const glintN = Math.min(10, Math.floor(s.budget * 0.15))
  const targets = textPoints(String(s.level), s.fontPx, s.budget - glintN, s.cx, s.cy, 'outline')
  const far = Math.hypot(s.w, s.h) * 0.6
  const shards = targets.map((p, i) => {
    const a = r() * Math.PI * 2
    return {
      tx: p.x,
      ty: p.y,
      sx: s.cx + Math.cos(a) * far,
      sy: s.cy + Math.sin(a) * far,
      rot0: (r() - 0.5) * 8,
      rot: (r() - 0.5) * 0.6,
      size: s.fontPx * (0.045 + r() * 0.035),
      delay: (i / Math.max(1, targets.length)) * 700 + r() * 150,
      vx: (p.x - s.cx) * 0.004 + (r() - 0.5) * 0.4,
      vy: (p.y - s.cy) * 0.004 - r() * 0.3,
      spin: (r() - 0.5) * 0.02,
      color: s.colors[i % s.colors.length]
    }
  })
  const glints = Array.from({ length: glintN }, () => ({
    x: s.cx + (r() - 0.5) * s.fontPx * 2.2,
    y: s.cy + (r() - 0.5) * s.fontPx * 1.1,
    t0: 1200 + r() * 1400,
    size: 8 + r() * 10
  }))
  const shatter = s.durationMs * 0.7
  const text = String(s.level)
  const font = `900 ${s.fontPx}px system-ui, sans-serif`
  // Vidro de ametista do número (força no globalAlpha).
  const glassGrad = c0.createLinearGradient(0, s.cy - s.fontPx / 2, 0, s.cy + s.fontPx / 2)
  glassGrad.addColorStop(0, hexA(WHITE, 0.55))
  glassGrad.addColorStop(0.5, hexA(s.color, 0.5))
  glassGrad.addColorStop(1, hexA(s.accent, 0.6))
  return {
    particles: shards.length + glints.length,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      drawGlow(
        ctx,
        s.color,
        s.cx,
        s.cy,
        s.fontPx * 1.6,
        window4(t, 600, 1400, shatter, shatter + 300) * 0.55
      )
      const glass = window4(t, 1000, 1700, shatter - 100, shatter + 150) * fade
      if (glass > 0) {
        ctx.font = font
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.globalAlpha = glass
        ctx.fillStyle = glassGrad
        ctx.fillText(text, s.cx, s.cy)
        ctx.globalAlpha = 1
      }
      const band = prog(t, 1500, 2300) // brilho que atravessa o número
      const bandX = s.cx - s.fontPx * 1.5 + band * s.fontPx * 3
      for (const sh of shards) {
        const p = easeOutBack(prog(t, sh.delay, sh.delay + 900))
        if (p <= 0) continue
        let x = sh.sx + (sh.tx - sh.sx) * p
        let y = sh.sy + (sh.ty - sh.sy) * p
        let rot = sh.rot0 + (sh.rot - sh.rot0) * Math.min(1, p)
        const lt = t - shatter
        if (lt > 0) {
          x += sh.vx * lt
          y += sh.vy * lt + 0.0006 * lt * lt
          rot += sh.spin * lt
        }
        const lit = band > 0 && band < 1 && Math.abs(x + (y - s.cy) * 0.5 - bandX) < s.fontPx * 0.25
        const alpha = fade * Math.min(1, p * 2)
        ctx.save()
        ctx.translate(x, y)
        ctx.rotate(rot)
        ctx.globalAlpha = alpha
        ctx.beginPath()
        ctx.moveTo(0, -sh.size)
        ctx.lineTo(sh.size * 0.6, sh.size * 0.2)
        ctx.lineTo(0, sh.size * 0.9)
        ctx.lineTo(-sh.size * 0.6, sh.size * 0.1)
        ctx.closePath()
        ctx.fillStyle = lit ? WHITE : sh.color
        ctx.fill()
        ctx.lineWidth = 1
        ctx.strokeStyle = WHITE_LINE
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, -sh.size)
        ctx.lineTo(0, sh.size * 0.9)
        ctx.globalAlpha = alpha * 0.8
        ctx.strokeStyle = s.accent
        ctx.stroke()
        ctx.restore()
      }
      for (const g of glints) {
        const a = window4(t, g.t0, g.t0 + 150, g.t0 + 200, g.t0 + 600)
        sparkle(ctx, g.x, g.y, g.size, WHITE, a * fade, t * 0.003)
      }
    }
  }
}

/** 60 · Rubi: explosão de fogo no centro, labaredas subindo e brasas flutuando. */
const fire: Builder = (s, r, c0) => {
  const flameN = Math.floor(s.budget * 0.55)
  const emberN = s.budget - flameN
  const fireColors = ['#fff3b0', '#fbbf24', '#f97316', s.color, s.accent]
  const flames = Array.from({ length: flameN }, () => {
    const a = -Math.PI / 2 + (r() - 0.5) * 1.6
    return {
      cos: Math.cos(a),
      sin: Math.sin(a),
      v: 0.3 + r() * 0.45,
      life: 700 + r() * 600,
      offset: r() * 1100,
      size: 30 + r() * 40 + s.power * 20,
      wob: r() * Math.PI * 2
    }
  })
  const embers = Array.from({ length: emberN }, () => {
    const a = r() * Math.PI * 2
    const v = 0.5 + r() * 0.8
    return {
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      rise: 0.08 + r() * 0.12,
      wob: r() * Math.PI * 2,
      size: 1.5 + r() * 2.5,
      life: 1800 + r() * 1200,
      color: fireColors[Math.floor(r() * 3)]
    }
  })
  // As labaredas sobem de baixo do número, atravessando ele.
  const baseY = s.cy + s.fontPx * 0.5
  const colorAt = (k: number): string =>
    fireColors[Math.min(fireColors.length - 1, Math.floor(k * fireColors.length))]
  // Calor no fundo (força no globalAlpha).
  const heatGrad = c0.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, Math.max(s.w, s.h) * 0.7)
  heatGrad.addColorStop(0, hexA(s.color, 1))
  heatGrad.addColorStop(0.5, hexA(s.accent, 0.5))
  heatGrad.addColorStop(1, hexA(s.accent, 0))
  const ringMax = Math.max(s.w, s.h) * 0.5
  return {
    particles: s.budget,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      const heat = window4(t, 0, 200, 1400, 2600) * 0.35
      if (heat > 0) {
        ctx.globalAlpha = heat
        ctx.fillStyle = heatGrad
        ctx.fillRect(0, 0, s.w, s.h)
        ctx.globalAlpha = 1
      }
      ctx.globalCompositeOperation = 'lighter'
      drawGlow(ctx, '#fbbf24', s.cx, s.cy, 260 + 140 * s.power, window4(t, 0, 80, 100, 600))
      // Anel de choque rubi.
      const ring = prog(t, 60, 900)
      if (ring > 0 && ring < 1) {
        ctx.beginPath()
        ctx.arc(s.cx, s.cy, easeOut(ring) * ringMax, 0, Math.PI * 2)
        ctx.lineWidth = 10 * (1 - ring) + 1
        ctx.globalAlpha = 1 - ring
        ctx.strokeStyle = s.color
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      // Labaredas: cada uma nasce de novo embaixo enquanto o fogo dura.
      const burning = 1 - prog(t, 1400, 2200)
      if (burning > 0) {
        for (const f of flames) {
          if (t < f.offset * 0.15) continue
          const lt = (t + f.offset) % f.life
          const k = lt / f.life
          const d = f.v * lt
          const x = s.cx + f.cos * d * 1.3 + Math.sin(f.wob + t * 0.01) * 6
          const y = baseY + f.sin * d - 0.00025 * lt * lt
          drawGlow(ctx, colorAt(k), x, y, f.size * (1 - k * 0.7), (1 - k) * 0.85 * burning)
        }
      }
      const lt = t - 80
      if (lt >= 0) {
        const drag = 1 - Math.exp(-lt / 350)
        for (const e of embers) {
          if (lt > e.life) continue
          const x = s.cx + e.vx * 350 * drag + Math.sin(e.wob + lt * 0.004) * 14
          const y = s.cy + e.vy * 350 * drag - e.rise * lt
          const a = (1 - lt / e.life) * fade * (0.6 + 0.4 * Math.sin(lt * 0.03 + e.wob))
          drawGlow(ctx, e.color, x, y, e.size * 4, a)
        }
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}

/** 70 · Diamante: um feixe branco bate no diamante e se abre num leque de arco-íris. */
const prism: Builder = (s, r, c0) => {
  const n = s.budget
  const spectrum = ['#f87171', '#fb923c', '#facc15', '#4ade80', '#60a5fa', '#818cf8', '#c084fc']
  const len = Math.hypot(s.w, s.h)
  const glints = Array.from({ length: n }, () => {
    const a = r() * Math.PI * 2
    const d = 80 + r() * len * 0.5
    return {
      a,
      d,
      x: s.cx + Math.cos(a) * d,
      y: s.cy + Math.sin(a) * d,
      size: 4 + r() * 9,
      color: r() < 0.5 ? WHITE : s.color
    }
  })
  const gem = 34 + 16 * s.power
  const spread = 0.05 + 0.03 * s.power
  const beamAngle = (i: number, t: number): number =>
    -0.55 + (i / (spectrum.length - 1)) * 1.1 + Math.PI * 0.12 + prog(t, 1200, 3000) * Math.PI * 1.1
  // Um gradiente radial por cor do leque, criados uma vez.
  const beams = spectrum.map((color) => {
    const g = c0.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, len)
    g.addColorStop(0, hexA(color, 0.75))
    g.addColorStop(1, hexA(color, 0))
    return g
  })
  const gemGrad = c0.createLinearGradient(-gem, -gem, gem, gem)
  gemGrad.addColorStop(0, WHITE)
  gemGrad.addColorStop(0.5, s.color)
  gemGrad.addColorStop(1, s.accent)
  const inLayers = [
    { lw: 18, a: 0.12 },
    { lw: 7, a: 0.4 },
    { lw: 2.5, a: 1 }
  ]
  const sx = s.cx - len * 0.5
  const sy = s.cy - len * 0.32
  return {
    particles: n,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      // Feixe de entrada (do canto de cima à esquerda).
      const inP = easeOut(prog(t, 150, 650))
      if (inP > 0) {
        ctx.globalCompositeOperation = 'lighter'
        ctx.beginPath()
        ctx.moveTo(sx, sy)
        ctx.lineTo(sx + (s.cx - sx) * inP, sy + (s.cy - sy) * inP)
        ctx.lineCap = 'round'
        ctx.strokeStyle = WHITE
        for (const layer of inLayers) {
          ctx.lineWidth = layer.lw
          ctx.globalAlpha = layer.a * fade
          ctx.stroke()
        }
      }
      // Leque de cores saindo do diamante e girando pela tela.
      const out = easeOut(prog(t, 600, 1200))
      if (out > 0) {
        const l = len * out
        ctx.globalAlpha = fade
        for (let i = 0; i < beams.length; i++) {
          const a = beamAngle(i, t)
          ctx.beginPath()
          ctx.moveTo(s.cx, s.cy)
          ctx.lineTo(s.cx + Math.cos(a - spread) * l, s.cy + Math.sin(a - spread) * l)
          ctx.lineTo(s.cx + Math.cos(a + spread) * l, s.cy + Math.sin(a + spread) * l)
          ctx.closePath()
          ctx.fillStyle = beams[i]
          ctx.fill()
        }
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      // O diamante.
      const pop = easeOutBack(prog(t, 0, 450))
      if (pop > 0) {
        ctx.save()
        ctx.translate(s.cx, s.cy)
        ctx.scale(pop, pop)
        ctx.rotate(Math.sin(t * 0.002) * 0.08)
        ctx.globalAlpha = fade
        const g = gem
        ctx.beginPath()
        ctx.moveTo(-g, -g * 0.35)
        ctx.lineTo(-g * 0.5, -g * 0.8)
        ctx.lineTo(g * 0.5, -g * 0.8)
        ctx.lineTo(g, -g * 0.35)
        ctx.lineTo(0, g)
        ctx.closePath()
        ctx.fillStyle = gemGrad
        ctx.fill()
        ctx.lineWidth = 2
        ctx.strokeStyle = WHITE
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(-g, -g * 0.35)
        ctx.lineTo(g, -g * 0.35)
        ctx.moveTo(-g * 0.5, -g * 0.8)
        ctx.lineTo(-g * 0.25, -g * 0.35)
        ctx.lineTo(0, g)
        ctx.lineTo(g * 0.25, -g * 0.35)
        ctx.lineTo(g * 0.5, -g * 0.8)
        ctx.lineWidth = 1
        ctx.strokeStyle = WHITE_LINE
        ctx.stroke()
        ctx.restore()
        drawGlow(ctx, WHITE, s.cx, s.cy, gem * 3, 0.5 * fade * (0.7 + 0.3 * Math.sin(t * 0.01)))
      }
      // Brilhos que acendem quando um feixe passa por eles.
      if (out > 0) {
        for (const gl of glints) {
          if (gl.d > len * out) continue
          let near = 0
          for (let i = 0; i < spectrum.length; i += 3) {
            const diff = Math.abs(
              ((gl.a - beamAngle(i, t) + Math.PI * 3) % (Math.PI * 2)) - Math.PI
            )
            near = Math.max(near, 1 - Math.min(1, diff / 0.12))
          }
          sparkle(
            ctx,
            gl.x,
            gl.y,
            gl.size * (0.5 + near),
            gl.color,
            (0.15 + near) * fade,
            t * 0.002
          )
        }
      }
    }
  }
}

/** 80 · Obsidiana: buraco negro suga tudo em espiral, colapsa e explode. */
const blackhole: Builder = (s, r, c0) => {
  const n = s.budget
  const collapse = 1900
  const far = Math.hypot(s.w, s.h) * 0.55
  const motes = Array.from({ length: n }, (_, i) => {
    const aOut = r() * Math.PI * 2
    return {
      r0: 120 + r() * far,
      a0: r() * Math.PI * 2,
      delay: r() * 500,
      vOut: 0.4 + r() * 0.9,
      cosOut: Math.cos(aOut),
      sinOut: Math.sin(aOut),
      size: 1.5 + r() * 2.5,
      color: i % 4 === 0 ? WHITE : s.colors[i % s.colors.length]
    }
  })
  const cur: Pt = { x: 0, y: 0 }
  const prev: Pt = { x: 0, y: 0 }
  const posIn = (m: (typeof motes)[number], t: number, out: Pt): void => {
    const u = prog(t, m.delay, collapse)
    const rad = m.r0 * (1 - u) ** 1.2
    const a = m.a0 + 7 * u * u
    out.x = s.cx + Math.cos(a) * rad
    out.y = s.cy + Math.sin(a) * rad * 0.8
  }
  // Escuridão em volta do centro (força no globalAlpha).
  const darkGrad = c0.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, far)
  darkGrad.addColorStop(0, 'rgba(0,0,0,1)')
  darkGrad.addColorStop(0.35, 'rgba(5,3,15,.7)')
  darkGrad.addColorStop(1, 'rgba(5,3,15,.25)')
  return {
    particles: n,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      const dark = window4(t, 0, 900, collapse + 50, collapse + 500) * 0.7
      if (dark > 0) {
        ctx.globalAlpha = dark
        ctx.fillStyle = darkGrad
        ctx.fillRect(0, 0, s.w, s.h)
        ctx.globalAlpha = 1
      }
      // Poeira em espiral (antes do disco: some atrás do horizonte).
      if (t < collapse) {
        for (const m of motes) {
          if (t < m.delay) continue
          posIn(m, t, cur)
          posIn(m, t - 50, prev)
          ctx.beginPath()
          ctx.moveTo(prev.x, prev.y)
          ctx.lineTo(cur.x, cur.y)
          ctx.lineWidth = m.size
          ctx.globalAlpha = 0.9 * prog(t, m.delay, m.delay + 300)
          ctx.strokeStyle = m.color
          ctx.stroke()
        }
        ctx.globalAlpha = 1
      }
      const hole = t < collapse ? 14 + 44 * easeIn(prog(t, 0, collapse * 0.8)) : 0
      const shrink = 1 - prog(t, collapse - 250, collapse)
      // Disco de acreção girando.
      if (t < collapse) {
        ctx.save()
        ctx.translate(s.cx, s.cy)
        ctx.scale(1, 0.35)
        ctx.rotate(t * 0.004)
        ctx.globalCompositeOperation = 'lighter'
        ctx.globalAlpha = 0.7 * prog(t, 0, 500)
        for (let k = 0; k < 3; k++) {
          ctx.beginPath()
          ctx.arc(0, 0, (hole * 1.6 + k * 16) * shrink, k, k + Math.PI * 1.4)
          ctx.lineWidth = 6 - k * 1.5
          ctx.strokeStyle = k === 1 ? WHITE : s.color
          ctx.stroke()
        }
        ctx.restore()
        ctx.beginPath()
        ctx.arc(s.cx, s.cy, hole * shrink, 0, Math.PI * 2)
        ctx.fillStyle = '#000'
        ctx.fill()
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.8
        ctx.strokeStyle = s.color
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      ctx.globalCompositeOperation = 'lighter'
      // Clarão do colapso e onda da explosão.
      drawGlow(
        ctx,
        WHITE,
        s.cx,
        s.cy,
        300 + 200 * s.power,
        window4(t, collapse - 40, collapse + 40, collapse + 60, collapse + 700)
      )
      const boom = prog(t, collapse, collapse + 1300)
      if (boom > 0 && boom < 1) {
        ctx.beginPath()
        ctx.arc(s.cx, s.cy, easeOut(boom) * far * 1.4, 0, Math.PI * 2)
        ctx.lineWidth = 16 * (1 - boom) + 1
        ctx.globalAlpha = (1 - boom) * 0.9
        ctx.strokeStyle = s.color
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      if (t >= collapse) {
        const lt = t - collapse
        const spread = 600 * (1 - Math.exp(-lt / 500))
        const a = fade * (1 - prog(lt, 900, 2000))
        for (const m of motes) {
          const d = m.vOut * spread
          drawGlow(ctx, m.color, s.cx + m.cosOut * d, s.cy + m.sinOut * d, m.size * 5, a)
        }
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}

/** 90 · Celestial: o céu escurece e estrelas desenham o número, ligadas por linhas. */
const constellation: Builder = (s, r, c0) => {
  const shootingN = 2
  const bgN = Math.floor(s.budget * 0.3)
  const starN = s.budget - bgN - shootingN
  // Contorno denso em ordem (segue o traço) e depois uma estrela a cada tanto.
  const contour = pathOrder(textPoints(String(s.level), s.fontPx, Infinity, s.cx, s.cy, 'outline'))
  const stride = Math.max(1, contour.length / Math.max(1, starN))
  const stars = Array.from(
    { length: Math.min(starN, contour.length) },
    (_, i) => contour[Math.floor(i * stride)]
  )
  const gap = Math.max(s.fontPx * 0.12, (s.fontPx / 40) * stride * 2.2)
  // Quais vizinhas se ligam (decidido uma vez, não a cada quadro).
  const linked = stars.map(
    (st, i) => i > 0 && Math.hypot(st.x - stars[i - 1].x, st.y - stars[i - 1].y) <= gap
  )
  const bg = Array.from({ length: bgN }, () => ({
    x: r() * s.w,
    y: r() * s.h,
    size: 1 + r() * 2,
    tw: r() * Math.PI * 2
  }))
  const shooting = Array.from({ length: shootingN }, (_, i) => ({
    x0: s.w * (0.1 + r() * 0.3),
    y0: s.h * (0.08 + r() * 0.15),
    t0: 2000 + i * 500
  }))
  const drawStart = 350
  const drawSpan = 1700
  const at = (i: number): number => drawStart + (i / Math.max(1, stars.length)) * drawSpan
  // Céu (força no globalAlpha) e rastro da estrela cadente (local, com translate).
  const nightGrad = c0.createRadialGradient(s.cx, s.cy, 0, s.cx, s.cy, Math.max(s.w, s.h) * 0.8)
  nightGrad.addColorStop(0, 'rgb(20,14,48)')
  nightGrad.addColorStop(1, 'rgb(6,4,20)')
  const trail = c0.createLinearGradient(-120, -60, 0, 0)
  trail.addColorStop(0, hexA(WHITE, 0))
  trail.addColorStop(1, hexA(WHITE, 0.95))
  return {
    particles: stars.length + bg.length + shooting.length,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      const night = window4(t, 0, 500, s.durationMs * 0.75, s.durationMs) * 0.55
      if (night > 0) {
        ctx.globalAlpha = night
        ctx.fillStyle = nightGrad
        ctx.fillRect(0, 0, s.w, s.h)
        ctx.fillStyle = WHITE
        for (const b of bg) {
          ctx.globalAlpha = clamp01(
            (0.4 + 0.6 * Math.abs(Math.sin(b.tw + t * 0.004))) * night * 1.6
          )
          ctx.fillRect(b.x, b.y, b.size, b.size)
        }
      }
      // Linhas ligando estrela com estrela (só as vizinhas, nada de pular dígito).
      ctx.lineWidth = 1.5
      ctx.globalAlpha = 0.55 * fade
      ctx.strokeStyle = s.color
      for (let i = 1; i < stars.length; i++) {
        if (!linked[i]) continue
        const p = prog(t, at(i - 1), at(i))
        if (p <= 0) continue
        const a = stars[i - 1]
        const b = stars[i]
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'lighter'
      const lift = prog(t, s.durationMs * 0.78, s.durationMs) * 30
      for (let i = 0; i < stars.length; i++) {
        const p = prog(t, at(i), at(i) + 250)
        if (p <= 0) continue
        const st = stars[i]
        const pulse = 0.75 + 0.25 * Math.sin(t * 0.006 + i)
        drawGlow(
          ctx,
          i % 3 ? s.color : s.accent,
          st.x,
          st.y - lift,
          9 * easeOutBack(p) * pulse,
          fade
        )
        sparkle(ctx, st.x, st.y - lift, 5 * p * pulse, WHITE, fade)
      }
      for (const sh of shooting) {
        const p = prog(t, sh.t0, sh.t0 + 700)
        if (p <= 0 || p >= 1) continue
        const x = sh.x0 + p * s.w * 0.5
        const y = sh.y0 + p * s.h * 0.25
        ctx.save()
        ctx.translate(x, y)
        ctx.beginPath()
        ctx.moveTo(-120, -60)
        ctx.lineTo(0, 0)
        ctx.lineWidth = 2
        ctx.globalAlpha = 1 - p
        ctx.strokeStyle = trail
        ctx.stroke()
        ctx.restore()
        drawGlow(ctx, s.color, x, y, 14, 1 - p)
      }
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}

/** 100 · Lendário: varrida de arco-íris, aurora, fogos de artifício e varrida final. */
const legendary: Builder = (s, r, c0) => {
  const rockets = Math.max(1, Math.min(5, Math.floor(s.budget / 8)))
  const per = Math.max(0, Math.floor((s.budget - rockets) / rockets))
  const shows = Array.from({ length: rockets }, (_, i) => ({
    t0: 1000 + i * 480,
    x0: s.w * (0.2 + r() * 0.6),
    tx: s.w * (0.12 + ((i * 0.37 + r() * 0.2) % 1) * 0.76),
    ty: s.h * (0.12 + r() * 0.25),
    color: RAINBOW[i % RAINBOW.length],
    sparks: Array.from({ length: per }, (_, k) => {
      const a = (k / per) * Math.PI * 2 + r() * 0.2
      return {
        a,
        cos: Math.cos(a),
        sin: Math.sin(a),
        v: 0.18 + r() * 0.12 + s.power * 0.05,
        color: k % 3 === 0 ? WHITE : RAINBOW[(i + k) % RAINBOW.length]
      }
    })
  }))
  // Aurora: um gradiente de arco-íris na largura da tela (força no globalAlpha).
  const auroraGrad = c0.createLinearGradient(0, 0, s.w, 0)
  RAINBOW.forEach((c, i) => auroraGrad.addColorStop(i / (RAINBOW.length - 1), c))
  const ribbonY = (x: number, t: number, k: number): number => {
    const base = s.h * (0.18 + k * 0.1)
    const amp = s.h * 0.06
    return (
      base +
      Math.sin(x * 0.006 + t * 0.0012 * (k + 1) + k) * amp +
      Math.sin(x * 0.013 - t * 0.002) * amp * 0.4
    )
  }
  const ribbon = (ctx: CanvasRenderingContext2D, t: number, k: number): void => {
    const height = s.h * (0.22 + k * 0.05)
    ctx.beginPath()
    ctx.moveTo(0, ribbonY(0, t, k))
    for (let x = 0; x <= s.w; x += 24) ctx.lineTo(x, ribbonY(x, t, k))
    for (let x = s.w; x >= 0; x -= 24) ctx.lineTo(x, ribbonY(x, t, k) + height)
    ctx.closePath()
    ctx.fill()
  }
  // Varrida: gradiente local (−bw…bw), movido com translate.
  const bw = s.w * 0.45
  const sweepGrad = c0.createLinearGradient(-bw, 0, bw, 0)
  sweepGrad.addColorStop(0, hexA(RAINBOW[0], 0))
  RAINBOW.forEach((c, i) => sweepGrad.addColorStop(0.2 + (i / RAINBOW.length) * 0.6, c))
  sweepGrad.addColorStop(1, hexA(RAINBOW[4], 0))
  const sweep = (ctx: CanvasRenderingContext2D, p: number, rtl: boolean, alpha: number): void => {
    if (p <= 0 || p >= 1) return
    const x = rtl ? s.w + bw - p * (s.w + bw * 2) : -bw + p * (s.w + bw * 2)
    ctx.save()
    ctx.transform(1, 0, -0.35, 1, s.h * 0.17, 0)
    ctx.translate(x, 0)
    ctx.globalAlpha = alpha
    ctx.fillStyle = sweepGrad
    ctx.fillRect(-bw, 0, bw * 2, s.h)
    ctx.restore()
  }
  return {
    particles: rockets + rockets * per,
    draw(ctx, t) {
      const fade = tailFade(t, s.durationMs)
      ctx.globalCompositeOperation = 'lighter'
      sweep(ctx, easeInOut(prog(t, 0, 900)), false, 0.35)
      const aurora = window4(t, 300, 1200, 3400, 4300) * 0.13
      if (aurora > 0) {
        ctx.globalAlpha = aurora
        ctx.fillStyle = auroraGrad
        for (let k = 0; k < 3; k++) ribbon(ctx, t, k)
        ctx.globalAlpha = 1
      }
      drawGlow(ctx, WHITE, s.cx, s.cy, 280 + 120 * s.power, window4(t, 350, 650, 700, 1500) * 0.6)
      for (const f of shows) {
        const climb = prog(t, f.t0, f.t0 + 450)
        if (climb <= 0) continue
        if (climb < 1) {
          const e = easeOut(climb)
          const x = f.x0 + (f.tx - f.x0) * e
          const y = s.h + 10 + (f.ty - s.h - 10) * e
          drawGlow(ctx, f.color, x, y, 10, 1)
          ctx.beginPath()
          ctx.moveTo(x, y)
          ctx.lineTo(x - (f.tx - f.x0) * 0.05, y + 40)
          ctx.lineWidth = 2
          ctx.globalAlpha = 0.6
          ctx.strokeStyle = f.color
          ctx.stroke()
          ctx.globalAlpha = 1
          continue
        }
        const lt = t - f.t0 - 450
        if (lt > 1600) continue
        drawGlow(ctx, f.color, f.tx, f.ty, 90, window4(lt, 0, 40, 60, 400))
        const a = (1 - lt / 1600) * fade
        const d = 1000 * (1 - Math.exp(-lt / 450))
        const fall = 0.00004 * lt * lt
        for (const sp of f.sparks) {
          const flicker = lt > 900 ? 0.5 + 0.5 * Math.sin(lt * 0.05 + sp.a * 10) : 1
          drawGlow(
            ctx,
            sp.color,
            f.tx + sp.cos * sp.v * d,
            f.ty + sp.sin * sp.v * d + fall,
            6,
            a * flicker
          )
        }
      }
      // Varrida final de luz, da direita para a esquerda.
      sweep(ctx, easeInOut(prog(t, 3300, 4300)), true, 0.28)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
    }
  }
}

const BUILDERS: Record<MilestoneKind, Builder> = {
  coins,
  shockwave,
  vines: vinesScene,
  ripple,
  crystals,
  fire,
  prism,
  blackhole,
  constellation,
  legendary
}

/** Instante (ms) do "impacto" de cada cena, quando a faixa/overlay treme. */
export const IMPACT_MS: Record<MilestoneKind, number> = {
  coins: 0,
  shockwave: 100,
  vines: VINES_IMPACT_MS,
  ripple: 460,
  crystals: 1400,
  fire: 60,
  prism: 600,
  blackhole: 1900,
  constellation: 2000,
  legendary: 1450
}

/** Cenas que desenham o próprio número (o título em DOM só deixa o espaço). */
export const DRAWS_NUMBER: ReadonlySet<MilestoneKind> = new Set(['crystals', 'constellation'])

/**
 * Monta a cena (partículas, gradientes e cores, uma vez só) no contexto onde
 * ela vai ser desenhada. `particles` é a contagem real, sem ajuste.
 */
export function buildScene(
  kind: MilestoneKind,
  input: SceneInput,
  ctx: CanvasRenderingContext2D
): Scene {
  const scene = BUILDERS[kind](input, rng(input.level * 7919 + 17), ctx)
  if (import.meta.env.DEV && scene.particles > input.budget) {
    console.error(`[milestone] ${kind}: ${scene.particles} partículas > budget ${input.budget}`)
  }
  return scene
}
