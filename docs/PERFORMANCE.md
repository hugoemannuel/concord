# Medição de performance (Windows)

Linha de base para provar que uma mudança melhorou (ou piorou) o consumo do app.
É uma ferramenta de **dev**: só roda com a flag `--perf-log` (ou a variável
`SALINHA_PERF_LOG=1`). Sem ela nada é observado, enviado ou gravado.

O que é medido, uma amostra por segundo:

- **CPU e RAM por tipo de processo** (Browser, Tab, GPU, Utility, Other).
- **FPS** e **Long Animation Frames** (quadros acima de 50 ms) do renderer.
- **Contexto** de cada amostra: janela `visible` / `minimized` / `tray`, rota,
  em chamada, transmitindo tela, assistindo tela.
- **Abertura**: app pronto, janela pronta e "primeira tela usável" (lista de
  servidores carregada), em ms desde o início do processo.

## Como medir

Meça sempre o app **empacotado**: o dev server do Vite (sem minificar, com HMR)
distorce abertura e CPU.

1. `cd frontend && yarn build:unpack`
2. Feche o Salinha instalado (o app aceita uma instância só).
3. Abra `frontend\dist\win-unpacked\Salinha.exe --perf-log`.
4. O arquivo é gravado em `%APPDATA%\Concord\perf\perf-AAAAMMDD-HHmmss.jsonl`
   (uma linha JSON por amostra; a última linha é `{"kind":"end"}` quando o app
   fecha normalmente).

## Roteiro dos cenários

O relatório agrupa sozinho pelo contexto, então basta percorrer o roteiro sem
marcar nada. Cada troca de contexto descarta os 10 s iniciais.

| # | Cenário | Duração |
|---|---|---|
| 1 | Janela visível, parada, num canal de texto | 2 min |
| 2 | Janela fechada na bandeja | 2 min |
| 3 | Rolando um canal com muitas mensagens | 1 min |
| 4 | Em chamada de voz | 2 min |
| 5 | (opcional) Transmitindo tela | 2 min |
| 6 | (opcional) Assistindo a tela de alguém | 2 min |

O cenário 3 cai no mesmo contexto do 1 (`visible`); para separá-los, grave um
arquivo por cenário.

Para comparar duas versões: mesma máquina, mesmo roteiro, app recém-aberto,
nada pesado rodando ao lado. Se a diferença for pequena, repita.

## Ler o relatório

```bash
node scripts/perf-report.mjs perf.jsonl                  # um arquivo
node scripts/perf-report.mjs antes.jsonl depois.jsonl    # antes → depois e Δ%
```

- **CPU total %**: soma dos processos, em % da máquina inteira (média e p95).
- **RAM total MB**: soma do working set dos processos.
- **FPS (p5)**: o pior 5% dos segundos; mais alto é melhor.
- **LoAF por minuto / máx**: quadros acima de 50 ms; menos é melhor.
- FPS e LoAF só existem no contexto `visible`: com a janela minimizada ou na
  bandeja o Chromium limita a animação a 1 Hz, o que daria um falso "quadro
  longo" por segundo. Nesses contextos compare CPU e RAM.
- `tray` é a janela oculta pelo botão de fechar; `minimized` é a minimizada;
  `unfocused` é a janela visível sem foco (atrás do jogo ou noutro monitor).
- **(amostra pequena)**: menos de 30 amostras válidas no contexto; não confie.
- `—` quer dizer que a métrica não existe naquele arquivo/contexto.
- Aviso de "sem linha end": o app fechou de forma abrupta; os dados valem.

## Privacidade

Da rota só ficam os segmentos fixos conhecidos (`servers`, `channels`, `dm`,
`convite`...); todo o resto vira `:id`, inclusive o código de convite. O arquivo
não guarda mensagens nem nomes. Se uma rota nova aparecer como `:id`, inclua o
segmento em `FIXED_SEGMENTS` (`frontend/src/shared/perfLog.ts`). Mesmo assim,
olhe o arquivo antes de anexá-lo a um PR.

## Investigar um número ruim

O `--perf-log` diz **quanto**; para descobrir **por quê**, use o Chromium:

- Abertura: `Salinha.exe --trace-startup --trace-startup-file=%TEMP%\trace.json`
- Rolagem e chamadas: aba **Performance** do DevTools (Ctrl+Shift+I).

Abra o trace em `chrome://tracing` ou em <https://ui.perfetto.dev>. Isso é
investigação; a comparação entre PRs usa sempre o relatório acima.

# Banco de medição automatizado (CPU/GPU em segundo plano)

O `--perf-log` acima mede o uso real, sem roteiro fixo. Para provar que uma
otimização de CPU/GPU funcionou, use o banco automatizado: ele sobe o **build de
produção** (`electron-vite build` + electron, não o dev server) com um perfil
isolado, entra com contas de teste num backend local, passa por cenários fixos e
grava uma amostra por segundo.

```bash
# 1. Backend + LiveKit locais (num terminal à parte). Com SMTP vazio o backend
#    imprime o link de confirmação de e-mail no log, que o banco usa.
scripts/server-up.sh 2>&1 | tee /tmp/backend.log

# 2. O banco (≈ 35 min com os padrões). Constrói com VITE_SERVER_URL da --api.
node scripts/perf-bench.mjs --label antes --api http://localhost:8080/api \
  --backend-log /tmp/backend.log --shots --trace b,d,i

# 3. Comparar dois resultados
node scripts/perf-bench.mjs --compare antes.json depois.json
```

Opções: `--reps 3` (repetições; vale a mediana), `--warmup 15` e `--duration 60`
(segundos por cenário), `--scenarios a,b,c,d,e,g,h,i`, `--skip-build`,
`--front <pasta>` (mede o `frontend/` de outro checkout — ex.: um commit antigo
numa worktree — com este banco), `--out <pasta>` (padrão:
`$TMPDIR/salinha-perf-bench`, onde ficam o JSON, as contas de teste reaproveitadas
em `seed.json`, as capturas de `--shots` e os traces de `--trace`). O backend
limita cadastros por IP: o banco cria as contas uma vez e reaproveita. Não rode
build nem testes pesados ao lado: eles entram na conta.

O electron sobe direto, com o inspetor do Node **só no processo main**
(`--inspect`); métricas, janela e cliques na página passam por ele
(`webContents.executeJavaScript`). De propósito nada se anexa ao renderer: o
Playwright, anexado, emula foco e visibilidade, e a página dizia "visible" mesmo
minimizada — o throttling de segundo plano do Chromium nunca aparecia na medição.

O que é gravado a cada 1 s:

- **CPU por tipo de processo** pelo `app.getAppMetrics()` (delta de
  `cumulativeCPUUsage`), em **% de um núcleo** (100 = um núcleo inteiro): Browser
  (main), GPU, Tab (renderer), Utility (áudio, rede).
- **GPU busy %** do `/sys/class/drm/card*/device/gpu_busy_percent` (amdgpu; lido a
  cada 100 ms e tirada a média do segundo). É a GPU **inteira** (compositor e
  outros apps entram), então compare sempre com a mesma máquina parada: aqui,
  sem o app, ~4%.
- **RAM** (working set somado).

No fim: média e p95 de cada métrica por cenário (mediana das repetições) e a faixa
das médias entre as repetições (o quanto o cenário oscila), em markdown e JSON.
`--trace` grava 10 s de trace do Chromium (`contentTracing`) por cenário depois
das repetições, para achar o culpado (abra em <https://ui.perfetto.dev>).

## Cenários

| # | Cenário | Como |
|---|---|---|
| a | Canal de texto, janela com foco | canal com 40 mensagens, servidor com o Maestro na lista |
| b | O mesmo, janela sem foco | o foco volta para outra janela; a do app continua visível (segundo monitor / atrás do jogo) |
| c | O mesmo, minimizada | `win.minimize()` |
| d | Em call de voz (só áudio), sem foco | outra pessoa (Chromium headless, microfone falso que bipa) na call |
| e | Em call assistindo uma transmissão, sem foco | a outra pessoa transmite a tela (captura falsa do Chromium) |
| f | Overlay de jogo | só no Windows (o overlay depende do helper e de jogo em tela cheia): ver o roteiro abaixo |
| g | Em call assistindo uma transmissão, minimizada | como o e, minimizada |
| h | Em call com avatares GIF, com foco | canal à parte com duas pessoas de avatar GIF animado (12 qps) e microfone que bipa |
| i | O mesmo, sem foco | |

No Hyprland a janela vai para um **monitor virtual** (`hyprctl output create
headless`), desenhado pela GPU de verdade mas fora da tela de quem usa o PC; o
cenário "com foco" rouba o foco do teclado enquanto mede. O Hyprland não
minimiza: o banco chama o `minimize()` do Electron e tira a janela da tela. Em
outros sistemas o banco usa só `focus()`/`blur()`/`minimize()` do Electron.

## Antes e depois (otimizações de segundo plano, out/2026)

Arch Linux, Hyprland (Wayland), 16 threads, GPU integrada AMD Lucienne. Antes =
`origin/develop` sem as mudanças; depois = a branch `perf/cpu-gpu-segundo-plano`;
os dois medidos com o mesmo banco, no mesmo dia e nas mesmas condições. CPU em %
de **um** núcleo; média / p95; mediana de 3 repetições de 60 s. GPU busy é da GPU
inteira (máquina parada sem o app: ~4%).

| Cenário | CPU total antes → depois | proc. GPU | renderer | main | GPU busy % |
|---|---|---|---|---|---|
| a texto, foco | 19.9 / 24.0 → 13.6 / 17.0 (−31%) | 9.2 → 6.2 | 8.7 → 5.0 | 2.6 → 1.7 | 16.3 → 11.4 |
| b texto, sem foco | 19.1 / 22.0 → 3.8 / 6.0 (−80%) | 8.7 → 0.4 | 8.7 → 2.8 | 2.3 → 0.4 | 16.6 → 4.9 |
| c texto, minimizada | 3.0 / 4.0 → 2.6 / 4.0 (−12%) | 0.4 → 0.0 | 2.2 → 2.3 | 0.3 → 0.3 | 4.5 → 4.4 |
| d call de voz, sem foco | 122.9 / 148.7 → 41.1 / 48.9 (−67%) | 46.1 → 4.1 | 60.2 → 27.1 | 6.2 → 1.3 | 41.3 → 9.6 |
| e call assistindo live, sem foco | 170.1 / 196.5 → 73.8 / 92.2 (−57%) | 66.3 → 16.5 | 85.3 → 44.3 | 6.3 → 3.3 | 51.8 → 22.8 |
| g call assistindo live, minimizada | 45.5 / 51.8 → 37.1 / 41.9 (−18%) | 0.4 → 0.3 | 35.9 → 27.9 | 0.3 → 0.3 | 4.9 → 4.7 |
| h call com avatares GIF, foco | 152.3 / 176.4 → 150.4 / 174.7 (−1%) | 60.2 → 57.9 | 72.6 → 74.3 | 6.1 → 6.0 | 44.2 → 44.3 |
| i call com avatares GIF, sem foco | 149.8 / 175.5 → 54.3 / 63.8 (−64%) | 59.4 → 7.9 | 73.0 → 35.2 | 5.9 → 1.6 | 44.9 → 13.2 |

Notas:

- **c e g quase não mudam aqui porque o Hyprland já para de desenhar a janela
  fora da tela.** No Windows não: com `backgroundThrottling: false` o Chromium
  segue montando quadros a 60 qps minimizado. Num electron puro, minimizado, o
  `requestAnimationFrame` roda 60 vezes por segundo sem throttling e 0 com ele.
  O ganho de c/g no Windows deve ser bem maior; medir pelo roteiro abaixo.
- **h (com foco) não muda de propósito:** com foco o app continua animando como
  antes; na medição os microfones falsos bipam o tempo todo, então os GIFs ficam
  quase sempre "falando".
- O que sobra em call sem foco é sobretudo áudio: os três AudioWorklets
  (supressão de ruído, voice mod, detecção de fala) ~13% de um núcleo no
  renderer, o processo Utility de áudio ~9% e o LiveKit. Em e, a live continua
  sendo decodificada e desenhada porque a janela está visível (segundo monitor).
- Depois de rebasear na `develop` e ajustar o `CallAvatar`, d, h e i foram
  medidos de novo no código final: 44.6, 147.6 e 52.8 (dentro da faixa acima).
- Uma primeira linha de base, medida com o Playwright anexado ao app e com um
  Chromium órfão de outra sessão disputando a GPU, ficou de fora: os números
  acima são os dois medidos limpos.

## Culpados encontrados

| Culpado | Evidência | Correção |
|---|---|---|
| `backgroundThrottling: false` sempre | página "visible" e rAF a 60/s minimizada | throttling ligado fora de chamada (`main/window/windowActivity.ts`) |
| Laço de rAF do ducking da música, eterno e sem música | trace: 609 `FireAnimationFrame` em 10 s no canal de texto parado | laço só com rampa e só com música na call |
| GIF do Maestro na lista de membros (12 qps) | trace: `ImageAnimationController` a cada quadro | primeiro quadro com o app em segundo plano |
| Animações infinitas (pulse do "Voz conectada", "Ao vivo", ping...) | `document.getAnimations()`: pulse infinito na call; 60 `DrawAndSwap`/s | pausadas em segundo plano (`shared/lib/perf/loopPauser.ts`) |
| Transições do anel de quem fala | trace: 188 `transitionrun` em 10 s na call | sem transições em segundo plano (`assets/background.css`) |
| Vídeo de live/câmera com a janela fora da tela | decodificação e desenho sem ninguém olhar | vídeo pausado no servidor (`features/call/lib/remoteSubscriptions.ts`) |
| Avatares GIF animando sempre na call | 12 qps por avatar | anima só falando ou com mouse/foco; parado em segundo plano |

O app avisa o renderer do foco/visibilidade da janela pelo IPC `window:activity`
(com o throttling desligado em chamada a própria página não sabe), guardado no
`shared/store/windowActivityStore.ts` (`useInBackground`).
Código novo que desenha em laço (canvas, rAF, vídeo) deve consultar esse store.

## Ficou de fora

- Medidor de sensibilidade, teste de microfone, anotações da live e efeitos de
  perfil em canvas: só rodam com a tela deles aberta (ou, nas anotações, com
  traço sumindo), e não apareceram nos traces.
- `backdrop-filter`/blur: só custa quando algo atrás muda; com as animações e
  transições paradas em segundo plano ele não é redesenhado. Não apareceu nos
  traces.
- Relógios de 1 s (duração da call) e polling de 10 s: uma pintura pequena por
  segundo, fora do ruído da medição.
- Os AudioWorklets da call (supressão de ruído e voice mod processavam mesmo
  sem efeito ligado): resolvido depois, ver
  [Etapas de áudio inativas fora do grafo](#etapas-de-áudio-inativas-fora-do-grafo).
- Com foco o app desenha como antes (animações, transições, GIFs): o pedido era
  segundo plano.

## Medir no Windows

Parte do ganho só aparece no Windows: lá a janela minimizada ou coberta pelo jogo
continua sendo desenhada (o DWM não segura o Chromium como o Hyprland), e o
overlay de jogo é uma janela transparente sempre por cima que o DWM compõe a cada
quadro do jogo. O helper Rust de áudio só roda transmitindo janela.

1. Gere os dois builds (PowerShell, na raiz do repo):

   ```powershell
   git fetch origin
   git worktree add ..\salinha-antes origin/develop
   git worktree add ..\salinha-depois perf/cpu-gpu-segundo-plano
   foreach ($d in '..\salinha-antes', '..\salinha-depois') {
     Push-Location "$d\frontend"; yarn install --frozen-lockfile; yarn build:unpack; Pop-Location
   }
   ```

2. Feche o Salinha instalado (bandeja → Sair). Para cada build (antes e depois),
   abra `frontend\dist\win-unpacked\Salinha.exe --perf-log` e, num PowerShell ao
   lado, grave a GPU por processo:

   ```powershell
   typeperf "\GPU Engine(*engtype_3D)\Utilization Percentage" -si 1 -sc 900 -f CSV -o gpu-antes.csv
   ```

3. Percorra o roteiro, ~2 min cada, com o mesmo jogo aberto em tela cheia (anote o
   FPS médio do jogo em cada passo, pelo contador do próprio jogo ou do Steam):
   1. Salinha em foco num canal de texto (sem o jogo).
   2. Jogo na frente, sem call (Salinha atrás: contexto `unfocused`).
   3. Salinha minimizada, sem call.
   4. Em call de voz com alguém falando, jogo na frente.
   5. Em call assistindo a live de alguém, jogo na frente.
   6. Em call com o overlay de jogo ligado (Configurações do aplicativo → overlay), jogo na frente.
   7. Em call assistindo a live, Salinha minimizada.

   Feche pela bandeja → Sair (grava a linha `end`).

4. Mande de volta: os dois `%APPDATA%\Concord\perf\perf-*.jsonl`, os dois
   `gpu-*.csv`, o FPS do jogo anotado em cada passo e a saída de
   `node scripts/perf-report.mjs antes.jsonl depois.jsonl`.

O banco automatizado (`scripts/perf-bench.mjs`) também roda no Windows (usa
`focus`/`blur`/`minimize` do Electron), mas precisa de backend e LiveKit locais
(no Windows, o `livekit-server.exe` nativo: o do Docker Desktop não passa mídia)
e não lê a GPU.

## DSP de áudio (JS → WASM)

O laço por amostra do voice mod roda em Rust compilado para WebAssembly, com o
JS de fallback ([ADR 0005](adr/0005-dsp-de-audio-em-wasm.md)). Para medir de novo:

```bash
node scripts/bench-dsp.mjs            # Node, sem DOM: os worklets (o voice mod em JS e em WASM)
node scripts/bench-dsp-chromium.mjs   # Electron (precisa de tela): OfflineAudioContext com o worklet de verdade
```

Custo por quantum (128 amostras a 48 kHz; o áudio pede 375 por segundo).
"JS antes" é o código anterior; "JS depois" é o JS com o laço otimizado (um
seno por amostra em vez de dois, sem `%` nos buffers circulares); "WASM" é o
que o app usa no voice mod. Arch Linux, Ryzen 7 5700U; ±1 µs de ruído.

**Node 26** (`bench-dsp.mjs`, média por quantum em ns):

| Cenário | JS antes | JS depois | WASM | antes → depois |
|---|---|---|---|---|
| voz/normal (bypass: o nó roda igual) | 5460 | 2983 | 2009 | 2,7× |
| voz/grave · esquilo · monstro (tom) | 5593–5682 | 3593–4012 | 2698–2873 | 2,1× |
| voz/eco · rádio · caverna · telefone · megafone | 5083–5154 | 2749–3746 | 1942–1959 | 2,6× |
| voz/robô (anel) | 6933 | 4947 | 3806 | 1,8× |
| voz/alien · fantasma (vibrato/tremolo) | 7173–7295 | 5232–5355 | 4352–4374 | 1,7× |
| fala/portão desligado (não portado¹) | 1422 | 1266 | — | 1,1× |
| fala/portão ligado (não portado¹) | 1932 | 1912 | — | 1,0× |
| tela/pcm estéreo (não portado) | 1184 | 1182 | — | — |

¹ A detecção chegou a rodar em WASM (538 e 1005 ns aqui), mas no Chromium e no
app o custo fixo de chamar o `process()` domina (tabelas abaixo) e o ganho
sumiu no ruído; ficou em JS.

Reverb e distorção não custam nada aqui: são nós nativos (ConvolverNode,
WaveShaper); o JS só gera o impulso (3,5 ms) e as curvas (< 0,5 ms) uma vez
por preset.

**Chromium 152 / Electron 44** (`bench-dsp-chromium.mjs`, ns por quantum,
inclui o custo de o motor chamar o `process()`; o grafo vazio é descontado):

| Cenário | JS antes | JS depois | WASM |
|---|---|---|---|
| voz/normal | 10 876 | 7 027 | 5 862 |
| voz/esquilo | 12 829 | 8 996 | 6 664 |
| voz/alien | 15 891 | 14 920 | 9 740 |
| fala/portão ligado | 5 956 | 5 896 | 5 180 (descartado) |

**No app** (`perf-bench.mjs --scenarios d --trace d`, call de voz sem foco,
3 × 60 s; antes = `origin/develop` com #310, depois = esta branch; trace de
10 s da thread "Realtime AudioWorklet", ms de CPU por segundo):

| | antes | depois |
|---|---|---|
| CPU total (% de um núcleo, média / p95) | 40,6 / 47,9 | 36,0 / 42,9 |
| renderer (Tab) | 26,2 | 24,1 |
| thread do AudioWorklet (tudo) | 113,6 | 119,8 |
| · worklet do voice mod | 7,4 (mediana 18 µs) | 4,8 (mediana 10 µs) |
| · worklet da detecção de fala² | 4,3 | 4,9 |
| · worklet do RNNoise (não mexido) | 31,6 | 34,9 |
| · coleta de lixo (MinorGC) | 1,7 | 1,2 |

² Medido com a detecção ainda em WASM; como não ganhou nada, ela voltou
ao JS (com o `%` otimizado, ~igual ao antes).

A queda do voice mod (−2,6 ms/s, ~0,26 % de um núcleo) é a única mudança que
sai do ruído: a thread do AudioWorklet inteira oscila ±5 % entre traces (o
RNNoise, que não mudou, foi de 31,6 a 34,9), e a diferença do CPU total vem
quase toda da GPU e do processo de áudio, que este trabalho não toca. Dos ~114
ms/s da thread, ~41 são JS dos worklets (o RNNoise sozinho ~32, já WASM; a cola
JS dele chama o modelo a cada 480 amostras) e ~70 são o grafo nativo do Web
Audio (filtros, delays, waveshapers, analisador, destino). O próximo ganho de
áudio, se houver, está aí: tirar do grafo os nós do voice mod quando o preset
é Normal (hoje eles processam com os ganhos em zero) e o RNNoise quando a
supressão está desligada.

## Etapas de áudio inativas fora do grafo

Seguimento do trace acima. Antes, o microfone passava **sempre** pelo RNNoise
(com a supressão desligada, só o ganho dele ia a 0) e pelo grafo inteiro do
voice mod (no Normal, worklet + filtros + delays + waveshapers + convolver
com os ganhos em 0). Agora (`features/call/lib/audioStageSwitch.ts`):

- supressão desligada → o RNNoise não existe; voz Normal sem ajuste
  (`isVoiceModActive` falso) → o grafo do voice mod não existe. O sinal passa
  por um ganho direto.
- Ligar no meio da chamada cria a etapa **nova** (estado limpo, sem resto de
  áudio antigo nos buffers) e cruza direto → etapa com rampa linear de 15 ms,
  depois de um aquecimento: 100 ms o RNNoise (no Electron 44 o primeiro som
  sai em 17–26 ms: o WASM instancia na thread de áudio e o anel de 1920
  amostras enche), 60 ms o voice mod (meia janela do pitch shifter). Desligar
  cruza de volta e destrói a etapa ~50 ms depois do fim da rampa.
- A track enviada é a mesma o tempo todo: nada é republicado no LiveKit e os
  outros não perdem áudio. A detecção de fala, o portão e o medidor continuam
  nos mesmos pontos (depois do ganho de entrada / da cauda do voice mod).
- A supressão de ruído passou a vir **desligada por padrão** (o persist do
  `noiseSuppressionStore` foi para a versão 1, que leva todo estado antigo a
  desligado). Quem tinha ligado de propósito precisa ligar de novo uma vez.
  Desligada é sem supressão nenhuma: sem o RNNoise, a do Chromium só entra se
  a do usuário estiver ligada.

O que foi medido no Electron 44 / Chromium 152 (`AudioContext` de verdade,
contando as chamadas de `process()`):

| Situação do AudioWorkletNode | `process()` por segundo |
|---|---|
| ligado na entrada e na saída, devolvendo true | 375 |
| nunca ligado / desligado depois de usado, devolvendo true | 375 |
| só a entrada ou só a saída ligada, devolvendo true | 375 |
| depois de devolver false (desligado ou não) | 0 |
| religado e "acordado" depois de ter devolvido false | 0 (nunca volta) |

Ou seja: desconectar não basta (o worklet segue rodando, e o RNNoise sem
entrada ainda é chamado, só pula o modelo), e devolver false é definitivo.
Por isso a etapa inativa é destruída — o RNNoise pelo `destroy()` da
biblioteca, o voice mod pela mensagem `'stop'` (`VOICE_MOD_STOP`) — e
recriada ao voltar. Os nós nativos sem caminho até o destino não são
processados.

Estalo: uma senoide de 0,5 trocada pelo **inverso** (pior caso) com o
`switchStage` de verdade, entrando, saindo, invertendo no meio da rampa e
recriando: o maior degrau entre amostras foi 0,0144, o da própria senoide.
Duas armadilhas que apareceram nessa medição e ficaram de fora do código:
rampa marcada no `currentTime` (que fica até um buffer atrás da thread de
áudio) começa no passado e salta — as rampas começam depois de
`baseLatency` + 20 ms; e `cancelAndHoldAtTime` seguido de rampa saltava o
ganho de 1 para 0,13 na hora — as rampas nunca cancelam, cada uma entra
depois do fim da anterior.

**Medição de CPU pendente**: o banco (`perf-bench.mjs`, cenários d e h com
trace) não foi rodado para esta mudança. Pelo trace anterior (call de voz
sem foco, voz Normal, supressão ligada), a thread do AudioWorklet gastava ~114
ms/s: ~32–35 do RNNoise, ~5 do worklet do voice mod, ~5 da detecção e ~70 do
grafo nativo, do qual o voice mod é a maior parte. Com a supressão desligada
(agora o padrão) e a voz Normal, o esperado é sobrar só a detecção, o
analisador, os ganhos e o destino.
