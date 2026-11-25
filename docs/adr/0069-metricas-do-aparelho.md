# 0069. Medir o aparelho (app lento, travado ou pesado) com agregados por minuto feitos no app

- Status: aceito
- Data: 2026-11-25
- Complementa: [0029](0029-observabilidade-das-lives.md) e [0032](0032-sinais-de-qualidade-das-lives-e-calls.md) (mesma família `/api/obs/`, mesmo critério: cada sinal responde a uma pergunta que leva a uma ação)

## Contexto

A telemetria das lives e calls (0029/0032) só olha a mídia: rede, codec,
quadros. Quando alguém diz "o Salinha tá pesado" ou "travou", não há número
nenhum: nem CPU e memória do app, nem se a máquina está no limite, nem se a
interface travou, nem se a placa de vídeo está ligada.

Forças:

- **Custo no aparelho quase zero**: nada de laço de `requestAnimationFrame`
  permanente, nada que acorde a CPU com o app parado. O app já tem uma medição
  de dev (`--perf-log`, `main/perf/`) que lê `app.getAppMetrics()` por tipo de
  processo a cada segundo e um laço de rAF: boa para medir na mão, cara demais
  para ficar ligada em todo mundo.
- **VPS pequena** (2 vCPU, ~4 GB, dividida): linhas com teto, retenção de 14
  dias, nada de serviço novo, sem dependência nova.
- **Janela escondida não é travada**: com a janela oculta ou minimizada o
  Chromium espaça timers e rAF; um timer atrasado ali não diz nada.
- **Privacidade**: só números do app e do sistema; nunca a lista de
  programas, janelas ou processos de outras coisas.
- **Desktop é o alvo**; no app web só o que o navegador dá. Android fica de fora.

## Opções consideradas

1. **SDK de RUM/APM (Sentry, Datadog Electron SDK, OpenTelemetry JS)**: dão
   detector de "event loop block", métricas de runtime e envio em lote prontos.
   Dependência nova e dado saindo para terceiros (já descartado na 0029); o
   SDK do Sentry ainda reseta a janela de CPU do `getAppMetrics` de quem o
   chama junto. Descartada.
2. **Mandar cada leitura crua** (a cada 10–15 s, como o `--perf-log` faz a cada
   1 s) e agregar no servidor. Simples no app, mas 4–6× mais linhas e
   pedidos, e a maior parte nunca seria olhada. Descartada.
3. **Agregar no app por janela de tempo e mandar só o agregado (delta)**, como
   o modelo de métricas do OpenTelemetry com temporalidade delta: cada linha
   cobre só o intervalo desde a anterior (média, máximo, p95), o estado do
   app é pequeno e zera a cada envio. No mesmo estilo do que o repo já faz
   (POST com login na família `/api/obs/`, validação com tetos no servidor,
   retenção de 14 dias, painel só para devs). **Escolhida.**

## Decisão

### O que é medido (cada sinal, a pergunta e a ação)

| Pergunta | Sinal | Ação que ele habilita |
|---|---|---|
| **O app está consumindo muito?** De qual processo é? | CPU média (% da máquina) do principal, do renderer, da GPU e dos utilitários (`app.getAppMetrics()`, CPU cumulativa a cada 15 s); máximo do app inteiro; memória do app (média), do renderer e da GPU (máximo); `cpu_helpers`/`mem_helpers_mb`: os filhos nativos (`concord-live` e afins) **só no Linux**, por `/proc` | Renderer alto em call → olhar o que a tela da call faz (vídeos, animações, DSP no AudioWorklet); GPU alta assistindo → decodificador; principal alto → trabalho no main (detector de jogo, overlay). Comparar com a linha de base do estado. |
| …parado, em call ou transmitindo? Com jogo aberto? | `state` (`parado`, `call`, `transmitindo`), `watching` (assistindo alguma live), `game` (sim/não, **só** com a atividade ligada; senão vazio) | Linha de base por estado: uma versão que sobe a CPU "parado" é regressão; "pesado só com jogo aberto" é disputa de máquina, não bug do app. |
| **A máquina está no limite?** | CPU do sistema inteiro (média), memória livre (mínimo) e total, carga (1 min; não existe no Windows), na bateria, limite de velocidade da CPU anunciado pelo SO (`powerMonitor` `speed-limit-change`, Windows/macOS) | Memória livre < 10% → "pouca memória livre": o app não é o culpado, mas pesa mais (rever a memória do renderer). CPU do sistema alta com o app baixo → outra coisa ocupando a máquina. Limite < 100% → o SO está freando a CPU (calor/bateria). |
| **A interface está travando?** | Atraso do laço de eventos do renderer (timer de 2 s, **só com a janela visível**: p95 e máximo; atraso acima de 30 s é o aparelho suspenso e é descartado); quadros longos (`long-animation-frame`, ou `longtask` onde não houver; contados só com a janela visível: quantos, ms somados, o maior); interações lentas (`event` timing com `interactionId`, ≥ 200 ms, só com a janela visível: quantas e a pior); memória do JS (`performance.memory`: o máximo das leituras a cada 2 s com a janela visível e no fechamento da linha); a janela parou de responder (`BrowserWindow` `unresponsive`) | Travadas longas recorrentes numa versão → regressão (perfil com o `--perf-log`); memória do JS que só cresce → vazamento; `unresponsive` → travamento de verdade (o que estava aberto). |
| …ou só estava escondida? | `visible_pct`, `focused_pct`: % do tempo da linha com a janela visível e com foco, pelo estado da janela do app (no desktop o main avisa: em call a Page Visibility diz sempre visível); minimizada ou na bandeja = escondida, visível sem foco = visível | O atraso e os quadros longos só contam visível; a % diz quanto da linha foi medido. Janela escondida nunca vira "travada". |
| **Demora para abrir?** | `startup_ms` por abertura: do início do processo (desktop) ou da navegação (web) até a lista de servidores chegar (só se a pessoa já abriu logada) | Regressão de abertura numa versão → reverter/perfilar. |
| **A aceleração por hardware está ligada?** | `gpu_status` por abertura e renovado a cada envio: `enabled`, `software` (composição por software) ou `disabled` (`app.getGPUFeatureStatus().gpu_compositing`, `isHardwareAccelerationEnabled`; no web, pelo renderer do WebGL: SwiftShader/llvmpipe); `gpu_crashes`: o processo da GPU caiu (`child-process-gone`, `type = GPU`) | Sem GPU explica muita lentidão: driver, lista de bloqueio do Chromium, GPU que caiu e voltou por software. |
| **A rede do app (não a da mídia) está lenta?** | RTT do batimento do WebSocket (ADR 0037): mediana e máximo; latência das chamadas à API vista pelo app (Resource Timing das `fetch` para `/api/`: p50, p95, quantas) | WS/API lentos com mídia boa → servidor (CPU da VPS) ou rede de quem usa; comparar com as métricas do servidor. |

### Fora (sem pergunta que leve a uma ação hoje, ou caro)

- **Lista de programas, janelas ou processos de outras coisas**: privacidade.
  O "jogo aberto" é só sim/não da detecção que o app já faz.
- **Helpers nativos no Windows** (`concord-audio`, overlay): não há API barata
  sem abrir PowerShell/`tasklist` a cada leitura. No Linux sai por `/proc`.
- **Modo de economia de energia do Windows**: o Electron não expõe; a
  bateria e o limite de velocidade da CPU respondem o que importa.
- **Estado térmico do macOS** (`getCurrentThermalState`): quase ninguém usa
  macOS; o limite de velocidade já cobre o freio por calor.
- **Tempo de troca de servidor/canal**: exigiria marcar o fim do render em
  cada tela (código do chat); fica para quando houver reclamação concreta.
- **FPS da interface** (laço de rAF): acorda a CPU a cada quadro; os quadros
  longos respondem "travou" sem isso.
- **Disco, GPU % e temperatura**: não há API do Electron; sem dependência nova.
- **Android**: fora desta tarefa (ver o relatório).

### Como coleta

- **Processo principal** (`frontend/src/main/deviceStats/`): só liga quando o
  renderer pede a primeira vez (pessoa logada) e para depois de 10 min sem
  pedido (o próximo religa). A cada 15 s lê
  `app.getAppMetrics()` (reaproveita o `ProcessBreakdown` do `--perf-log`),
  `os.cpus()`/`freemem()`/`loadavg()` e a bateria; eventos (`unresponsive`,
  GPU que caiu, limite de velocidade) só contam. O renderer leva o agregado
  desde a última vez por IPC (`device-stats:take`, mesma checagem de origem do
  `app-metrics:sample`).
- **Renderer** (`features/observability/lib/device/`): observadores do
  `PerformanceObserver` (não acordam a CPU), um timer de 2 s só com a janela
  visível, a latência do WS anotada pelo `WsClient` no pong e a da API pelo
  Resource Timing. Um timer de 60 s fecha a linha: **1 por minuto em call ou
  live, 1 a cada 5 minutos parado**, e fecha antes quando o estado muda. O lote
  sai a cada 5 linhas, 5 minutos, ou quando a call acaba. Falha de envio é
  ignorada (é só telemetria). Visitante sem conta não manda.
- **Backend** (`internal/deviceobs/`): `POST /api/obs/device` (login de conta,
  3 pedidos a cada 5 min por abertura do app (pessoa + sessão), até 10 linhas
  por pedido, 16 KiB, cada
  número com teto) grava `device_sessions` (uma por abertura do app) e
  `device_samples`; `GET /api/obs/devices?days=N` monta o painel (médias
  pesadas pelos segundos de cada linha; só `dev_badge_users`); apaga de hora em hora o que passou de 14 dias.

### Volume

Uma linha ≈ 200 bytes (35 números). Uso típico de uma pessoa: 4 h com o app
aberto parado (48 linhas) + 2 h em call (120) ≈ **170 linhas/dia**. Para ~100
pessoas: **~17 mil linhas/dia, ~240 mil em 14 dias (~50 MB com o índice)**.
Teto por pessoa: 1 440 linhas/dia (24 h em call); o limite do servidor (3
pedidos × 10 linhas a cada 5 min por abertura) segura cada abertura de um app
adulterado em ≤ 8 640/dia.
Pedidos: 1 a cada 5 min por pessoa (≈ 0,3 pedido/s para 100 pessoas).

## Consequências

- Dá para responder "tá pesado/travou" com números por pessoa, versão,
  sistema e placa, e comparar com a linha de base de cada estado.
- No app: um timer de 60 s sempre (com login), um de 2 s só com a janela
  visível, um de 15 s no principal; nenhum rAF.
- Fechar o app perde a linha aberta e o lote ainda não enviado (≤ 5 min).
- `cpu_*` é % da **máquina inteira** (dividido pelos núcleos), como no popover
  de conexão: 12,5% numa máquina de 8 núcleos = um núcleo cheio.
- Linux: os helpers saem por `/proc` assumindo 100 ticks/s e páginas de 4 KiB
  (o padrão do kernel); outra configuração erra a escala, não o sinal.
- Os textos legais (privacidade) precisam listar os dados novos (relatório da tarefa).
- Migration nova: 000213 (`device_sessions`, `device_samples`).

## Fontes

- Electron — `app.getAppMetrics`, `getGPUFeatureStatus`, `powerMonitor`
  (`isOnBatteryPower`, `speed-limit-change`), `BrowserWindow` `unresponsive`:
  https://www.electronjs.org/docs/latest/api/app,
  https://www.electronjs.org/docs/latest/api/power-monitor;
  desempenho: https://electronjs.org/docs/latest/tutorial/performance
- Electron PR #53337 (a janela de CPU do `getAppMetrics` é de quem chama;
  por isso a CPU cumulativa): https://releases.electronjs.org/pr/53337
- Sentry Electron — detector de bloqueio do laço de eventos e métricas de
  runtime (o que um SDK pronto mede, para comparar e cortar):
  https://docs.sentry.io/platforms/javascript/guides/electron/configuration/event-loop-block,
  https://docs.sentry.io/platforms/javascript/guides/electron/configuration/integrations/noderuntimemetrics/
- Datadog Electron SDK (main + renderer na mesma sessão):
  https://www.datadoghq.com/blog/datadog-electron-sdk/
- Chrome — Long Animation Frames API (observador, limite de 50 ms, buffer de
  200): https://developer.chrome.com/docs/web-platform/long-animation-frames;
  web.dev — interações lentas no campo (Event Timing):
  https://web.dev/articles/find-slow-interactions-in-the-field
- OpenTelemetry — modelo de métricas, temporalidade delta:
  https://opentelemetry.io/docs/specs/otel/metrics/data-model/
