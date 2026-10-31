# Em atividade (jogo em andamento e música)

Como no Discord: o jogo que a pessoa está jogando aparece embaixo do nome (lista
de membros, amigos, DMs, barra do usuário, painel de voz e perfil) e na coluna
**Atividade — N** da tela de Amigos.

> Não confundir com as **atividades de call** (jogos web como o Krunker, em
> `internal/call/activity.go`): aquilo é outra coisa.

## Fluxo

1. **Detecção (só Electron no Windows).** `frontend/src/main/activity/gameDetector.ts`
   lista os processos (`tasklist`) a cada 15 s e procura executáveis do
   catálogo `frontend/src/shared/gameCatalog.ts`. Processo fora do catálogo
   nunca sai do PC. Para incluir um jogo, adicione uma entrada em `GAMES`.
   **Jogos da Steam fora do catálogo** (`main/steamGames.ts`): a Steam grava o
   appid do jogo aberto em `HKCU\Software\Valve\Steam\RunningAppID`; o título
   vem do `appmanifest_<appid>.acf` local (bibliotecas em `libraryfolders.vdf`).
   O catálogo tem prioridade; sem entrada, o jogo aparece com o nome da Steam.
   O ícone do jogo vem do cache local (`appcache/librarycache/<appid>/<sha1>.jpg`):
   o detector manda `app_id` + `icon_hash` e todo cliente monta a imagem no CDN
   da comunidade da Steam (`GameIcon`); sem hash, ou se a imagem falhar, o
   controle genérico. O servidor só repassa os dois campos depois de validar
   (appid inteiro positivo e hash sha1 em hexadecimal).
2. **IPC.** `main/games.ts` liga/desliga o detector (`games:watch`) e avisa o
   renderer (`games:current`); exposto como `window.api.games`.
3. **Publicação.** `GameActivityBridge` + `presenceActivityStore` mandam
   `activity:set` / `activity:clear` pelo WebSocket (e de novo ao reconectar).
4. **Servidor.** `internal/platform/websocket/activity.go` guarda só em memória (some
   quando a última conexão cai) e envia `presence:activity` para o próprio
   usuário, amigos e membros de servidores em comum, sem bloqueados
   (`SQLAudience`). Invisível esconde a atividade.
5. **Carga inicial.** `GET /api/presence/activities?ids=` devolve o que o
   usuário pode ver; usado junto de `fetchPresenceFor`.

## Ouvindo (música)

Mesmo caminho do jogo, num slot separado (dá para jogar e ouvir ao mesmo tempo).
Decisão e alternativas: [ADR 0006](adr/0006-musica-em-atividade.md).

1. **Detecção (Electron no Windows e no Linux).** `main/activity/smtcMedia.ts`
   (Windows: o helper `concord-audio.exe media-watch` lendo o SMTC por eventos;
   sem ele, o PowerShell de `smtcPowerShell.ts` a cada 2 s) e `mprisMedia.ts` (Linux:
   `busctl` no MPRIS a cada 3 s) viram `MediaSession`. `mediaSessions.ts` só
   aceita players do catálogo `shared/musicApps.ts` (navegador só com álbum ou
   site de música conhecido). `musicTracker.ts` manda a faixa (início = agora -
   posição, duração) e só reenvia ao trocar de faixa, voltar da pausa ou pular
   (no máximo um a cada 15 s); pausado/sem nada por 10 s limpa.
2. **IPC.** `main/activity/music.ts` (`music:watch`, `music:current`), exposto
   como `window.api.music`.
3. **Publicação.** `MusicActivityBridge` + `listeningStore` mandam
   `activity:set` com `kind: "listening"` (app, título, artista, álbum,
   `position_ms`, `duration_ms`) e `activity:clear` com `kind: "listening"`.
4. **Servidor.** `internal/platform/websocket/listening.go` valida (app até 64
   caracteres, título/artista/álbum até 128, duração até 24 h), calcula o
   início no relógio do servidor e manda `presence:activity` com `activity`
   (jogo) e `listening` (música). Na carga inicial a música vem em
   `listening`, ao lado dos campos do jogo.
5. **Exibição.** Cartão de perfil: "Ouvindo Spotify", música, artista, álbum e a
   barra de tempo andando a cada segundo (`TrackProgress`). Lista de membros,
   amigos e DMs: "Ouvindo <música>" com o ícone do player (o jogo tem
   prioridade). Coluna Atividade dos Amigos: card de quem está ouvindo.

6. **Ouvir também.** Clicar na música (cartão de perfil) ou no botão do card da
   coluna Atividade abre o menu `ListeningActions`: "Ouvir no" YouTube, Spotify,
   YouTube Music, Deezer e Apple Music (`lib/listeningLinks.ts`) e "Adicionar à
   fila do Maestro". A atividade só guarda app, título, artista e álbum (sem URL
   nem ID da faixa): o menu mostra na hora a **busca por "artista - título"** e
   pede ao servidor os **links diretos da faixa** (`GET /api/music/links`,
   `internal/musiclinks`, [ADR 0033](adr/0033-links-diretos-do-ouvir-tambem.md)):
   iTunes → Apple Music, Deezer, a busca do Maestro → YouTube/YouTube Music
   (abre tocando) e Spotify só com `SPOTIFY_CLIENT_ID`/`SECRET`. O que não
   bater com a faixa ou falhar fica na busca. Clique antes da resposta espera
   até 3 s (`lib/directLinks.ts`). Os links abrem no navegador de fora
   (`target="_blank"`/`window.open`, que o main manda para
   `shell.openExternal` só para http/https). A fila usa
   `POST /api/servers/:id/music/enqueue {query}` (`music/activity_enqueue.go`):
   mesmas travas do `/play` (Maestro no servidor, quem pede na call, ao vivo e
   longo demais recusados, um pedido por vez por pessoa), mas sem seletor: entra
   o primeiro resultado tocável, direto da busca (sem resolver o link de novo) e
   reaproveitando a busca que o menu já fez (`music/search_cache.go`). O botão
   mostra "Adicionando…" até o servidor responder. Fora de call de servidor o
   item fica desabilitado com o motivo (`lib/queueTarget.ts`).

## Privacidade

- Quem vê: amigos aceitos + servidores em comum, menos bloqueios.
- Opções em Configurações → Privacidade e segurança → Atividade (padrão: ligadas):
  uma para o jogo, outra para a música.
- Limite no servidor: nome até 64 caracteres, tipos `game` e `listening`, no máximo 1 troca por
  segundo por tipo.

## Fora do escopo (por enquanto)

Streaks/"faixas", detecção no Linux/web e jogos fora do catálogo
que não sejam da Steam (Epic, GOG, etc.).
