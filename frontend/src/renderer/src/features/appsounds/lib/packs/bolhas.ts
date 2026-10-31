import type { SoundPack } from './types'
import { bloop } from './voices'

// Bolhas: "blups" de água que sobem (chegou, ligou) ou descem (saiu, desligou).

const V = 0.2
const up = (f: number, at: number, v = V) => bloop(f, at, v)
const drop = (f: number, at: number, v = V, d = 0.1) => bloop(f, at, v, 0.5, d)

export const bolhas: SoundPack = {
  id: 'bolhas',
  label: 'Bolhas',
  description: 'Blups de água, leves e divertidos.',
  sounds: {
    message: [up(400, 0), up(600, 0.1)],
    mention: [up(500, 0), up(700, 0.08), up(900, 0.16)],
    ring: [300, 450, 350, 500, 400, 600].map((f, i) => up(f, i * 0.12, 0.18)),
    join: [bloop(300, 0, V, 3, 0.12), up(600, 0.13)],
    leave: [drop(900, 0), drop(600, 0.12)],
    userJoin: [up(300, 0, 0.32), up(500, 0.09, 0.32), up(800, 0.18, 0.32)],
    userLeave: [drop(800, 0), drop(500, 0.11)],
    mute: [drop(600, 0)],
    unmute: [bloop(300, 0, V, 2, 0.1)],
    deafen: [bloop(500, 0, V, 0.3, 0.18)],
    undeafen: [bloop(150, 0, V, 3.3, 0.18)],
    liveStart: [300, 400, 500, 600, 750, 900].map((f, i) => bloop(f, i * 0.05, 0.16, 2.2, 0.06)),
    liveEnd: [900, 750, 600, 500, 400, 300].map((f, i) => bloop(f, i * 0.05, 0.16, 0.5, 0.06)),
    liveJoin: [bloop(1200, 0, 0.16, 2, 0.05)],
    lock: [bloop(200, 0, 0.25, 0.5, 0.05), bloop(150, 0.06, 0.25, 0.6, 0.05)],
    unlock: [bloop(150, 0, 0.25, 1.6, 0.05), bloop(200, 0.06, 0.25, 1.8, 0.05)],
    knock: [drop(250, 0, 0.3, 0.08), drop(250, 0.14, 0.3, 0.08), up(300, 0.3, 0.25)],
    update: [up(400, 0), up(600, 0.1), bloop(900, 0.2, V, 2.2, 0.1)]
  }
}
