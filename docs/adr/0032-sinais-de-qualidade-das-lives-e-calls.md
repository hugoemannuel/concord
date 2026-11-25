# 0032. Sinais de qualidade das lives e calls: só o que leva a uma ação

- Status: aceito
- Data: 2026-10-30
- Complementa: [0029](0029-observabilidade-das-lives.md) (mesmo pipeline, mesmas tabelas, mesmo painel)

## Contexto

O dono pediu observabilidade **com propósito**: só implementar um sinal se ele
ajudar a melhorar a qualidade das lives, do áudio e das calls. A 0029 já
guarda, por sessão, codec, placa/processador, fps, alvo, limitação, perda,
jitter, congelamentos e transporte. O primeiro dia de dados de produção
(30/10/2026, 8 sessões de live, 30 de voz) mostrou o que ela **não** consegue
responder:

1. **Lives a 1080p60 saem a 41–46 fps com `limitation = none`.** Sem limitação
   de CPU ou banda, o gargalo está antes do codificador (captura) ou o
   codificador não dá conta sem o navegador acusar — não dá para saber qual.
2. **Espectadores congelando muito (12–21 congelamentos e 6–10 s parados a
   cada 20 s) com perda 0, NACK 0 e PLI 0**, enquanto ainda chegavam ~3 Mbps.
   Ou os quadros chegam e o decodificador não dá conta, ou não chegam (quem
   transmite/SFU) — o `fps` gravado é o do segundo da leitura (`framesPerSecond`)
   e aparece como 1 num instante e 44 no seguinte.
3. **Live que começou em VP8 por software numa RTX 4060** e 40 s depois foi
   para H.265, e o caso conhecido do Linux com RTX 3070 indo de H.264: não há
   registro de *por que* o app escolheu aquele codec.
4. **Calls que não conectaram**: das 19:28 às 19:53 (UTC) ~16 sessões de voz
   (5 pessoas, refazendo a entrada a cada 1–2 min) ficaram sem par ICE e sem
   RTT — a janela em que o LiveKit estava sendo reconfigurado. Só dá para
   deduzir pela ausência de dado; não há etapa, motivo, nem tempo para entrar.
5. **Voz**: só o que o servidor recebe de *mim* (perda na subida). Nada sobre o
   que cada pessoa *ouve* — "áudio robotizado/cortes" é a reclamação típica e é
   do lado de quem ouve.

## Opções consideradas

1. **Mandar o `getStats()` inteiro** (ou um conjunto amplo, estilo
   callstats/`webrtc-internals`). Responde tudo, mas é volume e coluna "para
   ter", contra o pedido do dono.
2. **Serviço externo de qualidade WebRTC** (callstats, peermetrics,
   observertc). Dependência nova, dado saindo para terceiros (já descartado na
   0029).
3. **Poucos sinais, cada um amarrado a uma pergunta e a uma ação**, no mesmo
   POST de 20 s, nas mesmas tabelas e no mesmo painel (escolhida).

## Decisão

| Pergunta | Sinal | Decisão/ação que ele habilita |
|---|---|---|
| A live sai abaixo do fps escolhido sem limitação: é a **captura**? | `capture_fps` (transmite): quadros/s da `media-source` | Captura < 80% do alvo → o gargalo é o capturador do Chromium: priorizar a captura nativa (ADR 0031) ou outra fonte; não adianta mexer em codec/bitrate. |
| …ou o **codificador** não dá conta? | `codec_ms` (transmite): `totalEncodeTime/framesEncoded` no intervalo | ms por quadro ≥ 80% do tempo de um quadro no alvo → baixar o padrão (1080p60 → 1080p30/720p60) ou trocar o codec daquela placa. |
| Quanto abaixo do alvo ficou de verdade? | `fps` passa a ser a **média do intervalo** (`framesEncoded`/`framesDecoded`) em vez do segundo da leitura | O "% abaixo do alvo" do painel deixa de oscilar com o instante; dá para decidir o preset padrão com números estáveis. |
| O espectador congelou: os quadros **não chegaram** ou **chegaram e não decodificaram**? | `recv_fps` (assiste): `framesReceived`/s; `codec_ms` (assiste): ms por quadro no decodificador | Chegam ≫ decodificados → decodificador (codec/driver daquela placa/SO: tirar H.265 da ordem para ela, `nvidia-vaapi-driver`); não chegam com perda 0 → olhar quem transmite/SFU (camadas, pausa), não a rede de quem assiste. |
| Por que este PC transmitiu em H.264/VP8 e não em H.265/AV1? | evento `codec_escolhido`: preferência → codec + reserva, o que a placa codifica (AV1/H.265/H.264: placa, proc., —), camada 720p, codecs marcados "caiu no processador" | Marcado errado → limpar a marca (é permanente no aparelho); "—" no Linux/NVIDIA → só o motor nativo (ADR 0031) resolve; detecção errada → corrigir `screenCodecSupport`. |
| Quem **ouve** a voz robotizada/cortada? | `concealed_pct` (call): % das amostras recebidas que foram sintetizadas (`concealedSamples − silentConcealedSamples`), somando todas as vozes | Mede o sintoma direto da reclamação; separa quem ouve mal de quem fala mal. |
| …é a rede de quem ouve ou o PC dela? | `recv_loss_pct` (call): perda no áudio recebido (do SFU até mim) | Síntese com perda → rede de quem ouve (o RED já está ligado; ver TCP/TURN). Síntese **sem** perda → CPU/áudio do PC de quem ouve (DSP, ADR 0005): rever o custo do processamento local. |
| A voz não conecta para todo mundo (servidor) ou para uma rede (UDP bloqueado)? | evento `conexao_falhou`: a etapa (acesso, sinal, mídia; ou reconectando) e o motivo já mostrado à pessoa | Várias pessoas ao mesmo tempo na etapa "mídia" → configuração do servidor (ex.: `LIVEKIT_NODE_IP`, firewall): corrigir/reverter na hora. Uma pessoa só → rede dela: TURN/TLS na 443. |
| Entrar na call ficou mais lento depois de uma mudança de infra? | `connect_ms` (call): do "entrar" até a voz conectar (token + sinal + mídia) | Comparar antes × depois de mudar TURN, IP, porta ou VPS; regressão → reverter. |
| A voz cai no meio da call? quanto tempo fica fora? coincide com reinício do LiveKit? | evento `reconectou` (quanto tempo ficou fora) | Muitas quedas juntas → servidor (evitar `--infra` com gente na call); de uma pessoa só → rede dela. |

**Fora** (sem pergunta que leve a uma ação hoje): IPv4/IPv6 (100% das sessões
em UDP direto, nenhum caso de família errada), `jitterBufferDelay` (com perda e
síntese já se separa rede de PC), `qualityLimitationDurations` (o instante
segue `none`; a captura e o ms do codec respondem melhor), FEC/DTX/RED
(configuração fixa no código: `red: true`, `dtx: true`), estatísticas do
kernel da VPS (`RcvbufErrors` = 10 em 5 dias; fica como consulta no
OBSERVABILIDADE.md).

**Como**: as seis colunas novas em `live_samples` (migration 000176, todas
nulas, só números), três tipos de evento a mais, nada em `live_sessions`. O
app reaproveita a leitura que já faz: `media-source` referenciada pelo
`outbound-rtp` (captura), contadores de quadros e de tempo do codec, e o
`getStats()` de cada voz recebida (antes era só o do meu microfone). A conexão
vem das fases que o `callStore` já tem (`connection`), só **lidas** por uma
assinatura na ponte da telemetria — nenhum campo novo em god store. O motivo
do codec é anotado pelo `ScreenSender` num registro próprio
(`call/lib/screenCodecChoice`) e levado uma vez pela telemetria.

**Motor nativo (ADR 0031)**: o helper manda as estatísticas com os nomes do
WebRTC; se incluir a `media-source` (`frames`) e `framesEncoded`/
`totalEncodeTime` no `outbound-rtp`, captura e ms do codec funcionam sem
mudança. A escolha do codec dele entra por `noteScreenCodecChoice(...)`.

**Painel**: a voz entra nas "Piores sessões e por quê" com pontuação própria
(não conectar > reconectar > áudio sintetizado > perda) e motivos novos
("Captura abaixo do alvo (não é o codificador)", "Codificador não dá conta do
fps", "Quadros chegam e não decodificam", "Voz robotizada (áudio
sintetizado)", "Perda no áudio recebido", "Áudio sintetizado sem perda (PC de
quem ouve)", "Voz reconectou", "Voz não conectou"); cada sessão mostra uma
linha com os números. Os eventos novos aparecem em "Eventos recentes".

## Consequências

- Volume: seis números a mais por amostra (≈ 30 bytes) e no máximo um evento
  de codec por live e alguns de conexão por call. A retenção segue 14 dias.
- Ler a voz de todos custa um `getStats()` por pessoa na call a cada 60 s.
- Uma voz que entra ou sai no intervalo pode zerar a diferença daquela leitura
  (a soma cai); a próxima volta ao normal.
- `fps` muda de significado (instante → média do intervalo) a partir desta
  versão do app; amostras antigas continuam com o do instante.
- Privacidade: igual à 0029 (números técnicos e o motivo do erro em
  português, nenhum IP, nada do que se fala ou mostra).
- Migration nova: 000176 (`live_samples`: `capture_fps`, `recv_fps`,
  `codec_ms`, `concealed_pct`, `recv_loss_pct`, `connect_ms`).

## Fontes

- W3C — Identifiers for WebRTC's Statistics API: `RTCVideoSourceStats.frames`
  (media-source), `framesEncoded`/`totalEncodeTime`, `framesReceived`/
  `framesDecoded`/`totalDecodeTime`, `concealedSamples`/
  `silentConcealedSamples`/`totalSamplesReceived`: https://www.w3.org/TR/webrtc-stats/
- MDN — `RTCInboundRtpStreamStats` (`concealedSamples`, `framesReceived`):
  https://developer.mozilla.org/en-US/docs/Web/API/RTCInboundRtpStreamStats
- callstats/observertc (o que serviços de qualidade WebRTC coletam, para
  comparar e cortar): https://observertc.org/docs/
- Dados de produção de 30/10/2026 (`live_samples`, `live_events`,
  `livekit_metrics`), lidos só com SELECT.

## Emenda (2026-11-25): a telemetria não perde nem distorce o que mede

A análise dos dados de 11/11 a 25/11 (641 sessões de voz, 1 347 h) achou defeitos
no próprio sinal. Mudanças, todas sem coluna nova (sem migration) e com o servidor
aceitando o formato antigo:

| Sinal | Antes | Agora (a partir desta versão do app) |
|---|---|---|
| `recv_loss_pct` | perda somando todas as vozes: a perda na **subida de quem fala** aparecia em todos os ouvintes (21 % dos ouvintes com ≥ 2 % quando alguém subia mal, contra 3,7 %) | a **menor** perda entre as vozes com ≥ 100 pacotes no intervalo (contadores por faixa, `stat.id`): só sobe quando todas as vozes perdem, ou seja, a rede de quem ouve. Nulo sem voz com tráfego suficiente |
| `concealed_pct` | diferença da soma das vozes: uma voz que entrava ou saía zerava (ou inflava) a leitura | soma das diferenças por voz, só das vozes presentes nas duas leituras |
| `loss_pct` (voz) | `fractionLost` do último RTCP (instante, p99 de 14 % com picos isolados de 59–95 %) | média do intervalo: diferença de `packetsLost` do `remote-inbound-rtp` sobre os pacotes do intervalo (`packetsReceived` dele; sem ele, `packetsSent` do `outbound-rtp`). Nulo sem pacotes (microfone mudo) |
| `seconds` (voz) | `timestamp` do `remote-inbound-rtp` (hora do último RTCP): 55 amostras bateram no teto de 600 s | maior `timestamp` da leitura (a hora em que o app leu) |
| `connect_ms` | apagado em 11 % das sessões: a sessão da call antiga, ao terminar, levava o tempo da call nova | a sessão que termina leva só os eventos; o tempo vai na 1ª amostra da nova |
| hora dos eventos e do fim | hora em que o servidor gravou (até 60 s depois; nada se o envio falhasse) | o app guarda numa fila curta (20 rascunhos, 15 min) os que têm evento ou fim e reenvia no ciclo seguinte (sem as amostras); manda `ago_ms` em cada evento e no relatório, e o servidor grava `now() − ago_ms`, com teto de 15 min |
| `degrau_caiu` | detalhe com o `qualityLimitationReason` (85 % `none`) | detalhe com o motivo do controlador (`bandwidth`, `cpu`); sem motivo, o de antes |
| `app_version` (web) | vazia | versão do build (`VITE_APP_VERSION`, que o deploy passa; sem ela, a do `package.json`), usada quando o preload não responde |

Eventos novos:

| Pergunta | Sinal | Ação |
|---|---|---|
| Em que etapa a entrada demora? | `entrada_lenta` (entrada > 3 s): "acesso 0,2 s · sinal 0,4 s · mídia 4,1 s" | acesso → backend; sinal → Caddy/WebSocket; mídia → UDP/ICE (TURN) |
| Quantas entradas a pessoa refaz ou desiste? | `entrada_abandonada`: "nova tentativa" ou "saiu", a etapa e o tempo | crescendo numa rede ou versão → investigar ou reverter |
| Quanto a atualização com retomada (ou um crash) tira a pessoa da call? | `retomou` (servidor): sessão nova da mesma pessoa na mesma call com a antiga parada há 30 s–5 min; detalhe "73 s" ou "73 s · 0.6.97 → 0.6.98"; a antiga é fechada no último sinal dela | buraco grande ou frequente → rever a atualização no meio da call |

Sessões sem fim: a retenção (de hora em hora) fecha as sessões abertas sem notícia
há mais de 10 minutos (`ended_at = last_seen_at`, evento `fim` na mesma hora).

**Opções consideradas** para não perder eventos: (1) descartar (como era); (2) fila
em memória com teto e validade, reenviada no ciclo seguinte, com a idade do evento
(escolhida: o padrão dos SDKs de telemetria e do OpenTelemetry Collector, que também
desistem do dado mais velho depois de alguns minutos); (3) fila persistente
(IndexedDB) ou `sendBeacon` ao fechar a janela: o beacon não manda o cabeçalho de
autenticação e a fila em disco é peso para um sinal técnico. Para fechar sessões:
(1) só o fim mandado pelo app (como era); (2) vigia por falta de notícia (escolhida,
na retenção que já roda); (3) a sessão nova substitui a antiga da mesma pessoa e
call (escolhida também, porque é o único jeito de medir o buraco da retomada).

**Consequências**

- Colunas iguais, significado novo em `recv_loss_pct`, `concealed_pct`, `loss_pct`
  e `seconds` da voz: comparar períodos só filtrando por `app_version` (versões
  anteriores à desta emenda continuam com o significado antigo).
- Volume: até 20 rascunhos reenviados por pessoa depois de uma queda do servidor
  (dentro do limite de 6 pedidos por minuto) e poucos eventos novos por call
  (`entrada_lenta` em ~2 % das entradas, `retomou` ~1 por dia). Sem linhas novas fora
  de `live_events`.
- Risco conhecido: duas sessões legítimas da mesma pessoa na mesma call em dois
  aparelhos (4 casos em 14 dias) — a mais velha é fechada se ficar 30 s sem mandar.
  Como a voz manda a cada 60 s, isso pode acontecer; a amostra seguinte dela continua
  sendo gravada (só o `ended_at` fica).
- Privacidade: igual (números técnicos, etapa da entrada e a versão do app).

Fontes: MDN — `RTCRemoteInboundRtpStreamStats` (`fractionLost` é do último intervalo
de relatório; `packetsLost`/`packetsReceived` acumulados):
https://developer.mozilla.org/en-US/docs/Web/API/RTCRemoteInboundRtpStreamStats;
OpenTelemetry Collector — fila de envio e tempo máximo de reenvio:
https://opentelemetry.io/docs/collector/resiliency/; LaunchDarkly — por que o SDK de
observabilidade deixou o `sendBeacon`:
https://launchdarkly.com/docs/sdk/features/observability-sdk-behavior.
