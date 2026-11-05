// Jogos que a Salinha reconhece pelo nome do executável ("Em atividade").
// Só o que está aqui vira atividade: processo desconhecido nunca sai do PC.
// Puro: usado pelo main (detecção) e pelo renderer (cor do card).

export interface GameDefinition {
  /** Nome exibido, igual ao do Discord. */
  name: string
  /** Executáveis (minúsculos) que identificam o jogo. */
  exes: string[]
  /** Cor de destaque do card. */
  accent: string
  /**
   * Só conta com janela visível: o executável fica vivo em segundo plano
   * depois de fechado (o Roblox faz isso), e o processo sozinho mentiria.
   */
  needsWindow?: boolean
}

export const GAMES: readonly GameDefinition[] = [
  { name: 'VALORANT', exes: ['valorant-win64-shipping.exe'], accent: '#fd4556' },
  {
    name: 'League of Legends',
    // O cliente (saguão, fila, seleção de campeões) e a partida.
    exes: ['leagueclientux.exe', 'league of legends.exe'],
    accent: '#c89b3c'
  },
  { name: 'PUBG: BATTLEGROUNDS', exes: ['tslgame.exe'], accent: '#f2a900' },
  { name: 'Counter-Strike 2', exes: ['cs2.exe'], accent: '#de9b35' },
  { name: 'Fortnite', exes: ['fortniteclient-win64-shipping.exe'], accent: '#7d5fff' },
  {
    name: 'Minecraft',
    exes: ['minecraftlauncher.exe', 'minecraft.windows.exe'],
    accent: '#62b543'
  },
  { name: 'Roblox', exes: ['robloxplayerbeta.exe'], accent: '#e2231a', needsWindow: true },
  { name: 'Grand Theft Auto V', exes: ['gta5.exe'], accent: '#5aa469' },
  { name: 'Apex Legends', exes: ['r5apex.exe', 'r5apex_dx12.exe'], accent: '#da292a' },
  { name: 'Rocket League', exes: ['rocketleague.exe'], accent: '#1c8cff' },
  { name: 'Overwatch 2', exes: ['overwatch.exe'], accent: '#f99e1a' },
  { name: 'Dota 2', exes: ['dota2.exe'], accent: '#c23c2a' },
  {
    name: 'Rainbow Six Siege',
    exes: ['rainbowsix.exe', 'rainbowsix_vulkan.exe'],
    accent: '#3b7ddd'
  },
  { name: 'Genshin Impact', exes: ['genshinimpact.exe'], accent: '#5bc0eb' },
  { name: 'Free Fire', exes: ['hd-player.exe'], accent: '#ff7a00' }
]

const BY_EXE: ReadonlyMap<string, GameDefinition> = new Map(
  GAMES.flatMap((game) => game.exes.map((exe) => [exe, game] as const))
)

/** O jogo do catálogo que corresponde a um executável (sem diferenciar maiúsculas). */
export function gameForExe(exe: string): GameDefinition | undefined {
  return BY_EXE.get(exe.trim().toLowerCase())
}

/** O primeiro jogo do catálogo entre os executáveis em andamento, ou undefined. */
export function detectGame(runningExes: readonly string[]): GameDefinition | undefined {
  for (const exe of runningExes) {
    const game = gameForExe(exe)
    if (game) return game
  }
  return undefined
}

/** Executáveis em andamento (minúsculos) de jogos que só contam com janela visível. */
export function exesNeedingWindow(runningExes: readonly string[]): string[] {
  return runningExes
    .map((exe) => exe.trim().toLowerCase())
    .filter((exe) => gameForExe(exe)?.needsWindow)
}

/** Tira os executáveis de jogos `needsWindow` que não estão em `withWindow` (minúsculos). */
export function withoutHiddenGames(
  runningExes: readonly string[],
  withWindow: ReadonlySet<string>
): string[] {
  return runningExes.filter((exe) => {
    const name = exe.trim().toLowerCase()
    return !gameForExe(name)?.needsWindow || withWindow.has(name)
  })
}

/** Cor de destaque do jogo pelo nome (ou undefined se não for do catálogo). */
export function gameAccent(name: string): string | undefined {
  return GAMES.find((game) => game.name === name)?.accent
}
