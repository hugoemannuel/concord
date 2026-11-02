# Observabilidade das lives

O que existe para saber como as lives e calls estão de fato, e onde agir.
Decisão e alternativas: [ADR 0029](adr/0029-observabilidade-das-lives.md); os
sinais de qualidade (cada um com a pergunta e a ação que ele habilita):
[ADR 0032](adr/0032-sinais-de-qualidade-das-lives-e-calls.md).
Como ligar na VPS: [HOSPEDAGEM.md](HOSPEDAGEM.md#métricas-do-livekit-observabilidade-das-lives).

## O que é coletado

| Fonte | Tabela | De quanto em quanto | O quê |
|---|---|---|---|
| LiveKit (`/metrics`, Prometheus em 127.0.0.1) + `/proc` da VPS | `livekit_metrics` | 1 min | banda entrando/saindo, retransmissões, perda na subida (quem publica → SFU) e na descida (SFU → quem assiste), NACK, PLI, RTT, jitter, nota de qualidade, salas, participantes, tracks, CPU e memória do LiveKit e da VPS |
| App (quem transmite) | `live_sessions` (`transmite`) + `live_samples` | 20 s | codec, placa ou processador, resolução e fps codificados × escolhidos, **fps da captura** (`capture_fps`), **ms por quadro no codificador** (`codec_ms`), Mbps, `qualityLimitationReason`, degrau do controlador e trocas, camadas, reserva, quadros-chave, PLI, NACK, UDP/TCP/TURN |
| App (quem assiste) | `live_sessions` (`assiste`) + `live_samples` | 20 s | codec, decodificador na placa ou no processador, resolução, **quadros/s que chegaram** (`recv_fps`) × decodificados (`fps`), **ms por quadro no decodificador** (`codec_ms`), perda, jitter, congelamentos, quadros descartados, pausa do servidor, UDP/TCP/TURN |
| App (voz) | `live_sessions` (`call`) + `live_samples` | 60 s | RTT, perda e jitter vistos pelo servidor, UDP/TCP/TURN; **o que eu ouço**: % de áudio sintetizado (`concealed_pct`) e perda no áudio recebido (`recv_loss_pct`); **tempo para conectar** (`connect_ms`) |
| App e servidor | `live_events` | quando acontece | início, fim, qualidade caiu/voltou, reserva ligada, codificador/decodificador no processador, codec trocou, **codec escolhido (e por quê)**, congelamento longo (≥ 2 s em 20 s), pausada pelo servidor, **voz não conectou (etapa e motivo)**, **voz reconectou (tempo fora)** |

Contexto de cada sessão: SO, versão do app, web/desktop, placa de vídeo (renderer
do WebGL), núcleos do processador e tipo de rede (quando o navegador conta).
Nada do que se fala, escreve ou mostra. Tudo fica 14 dias (o backend apaga de
hora em hora). Visitante sem conta não manda.

Nos contadores das amostras (`freezes`, `freeze_ms`, `frames_dropped`,
`key_frames`, `pli`, `nack`, `step_changes`) o valor é a diferença no intervalo
`seconds`. `fps`, `capture_fps`, `recv_fps`, `codec_ms`, `concealed_pct` e
`recv_loss_pct` são médias do intervalo (a partir do app com a ADR 0032; antes,
`fps` era o do momento da leitura); o resto é o valor no momento. A primeira amostra de cada sessão é a
base (contadores zerados, `seconds = 0`).

## Painel

`/observabilidade` no app (no navegador: `https://<app>/observabilidade`), só
para quem está em `dev_badge_users` ([como conceder](HOSPEDAGEM.md#badge-fundador-devs)).
Não tem link no app. Mostra, para 24 h, 3, 7 ou 14 dias:

- **Servidor**: picos de saída, pessoas, CPU da VPS e perda média na descida;
  gráficos de banda (entrada/saída) e de CPU (VPS e LiveKit).
- **Lives recentes**: quem, quando, duração, codec, % na placa, % abaixo do
  alvo (fps < 80% do escolhido ou degrau abaixo do escolhido), limitação por
  CPU/banda, espectadores, congelamentos por minuto e % decodificando no
  processador entre os espectadores.
- **Piores sessões e por quê**: pontuação (abaixo do alvo, congelamentos,
  pausa, perda, CPU/banda, processador; na voz: não conectou, reconexões, áudio
  sintetizado, perda) e os motivos prováveis, com a linha de números da sessão
  (captura × codificado, chegam × decodificados, ms por quadro; na voz, áudio
  sintetizado, perda recebida, tempo para entrar).
- **Distribuição** por sistema, placa de vídeo, codec e conexão.
- **Eventos recentes.**

O mesmo JSON: `GET /api/obs/lives?days=7` (token de um dev).

## Consultas prontas (psql)

Na VPS: `psql "$DATABASE_URL"`.

**Banda e CPU por hora (últimas 24 h):**
```sql
SELECT date_trunc('hour', minute) AS hora,
       round((sum(bytes_out) * 8 / 1e6 / nullif(sum(seconds), 0))::numeric, 1) AS mbps_saida,
       round((sum(bytes_in) * 8 / 1e6 / nullif(sum(seconds), 0))::numeric, 1) AS mbps_entrada,
       round(max(host_cpu_pct)::numeric) AS cpu_vps_max,
       round(avg(livekit_cpu_pct)::numeric) AS cpu_livekit_media,
       max(participants) AS pessoas_max
FROM livekit_metrics
WHERE minute > now() - interval '24 hours'
GROUP BY 1 ORDER BY 1;
```

**A banda acaba antes da CPU?** (minutos mais carregados)
```sql
SELECT minute, round((bytes_out * 8 / 1e6 / nullif(seconds, 0))::numeric, 1) AS mbps_saida,
       round(host_cpu_pct::numeric) AS cpu_vps, round(livekit_cpu_pct::numeric) AS cpu_livekit,
       participants, video_tracks_out
FROM livekit_metrics WHERE up
ORDER BY bytes_out DESC LIMIT 20;
```

**Perda: subida (quem transmite) × descida (quem assiste), por dia:**
```sql
SELECT date_trunc('day', minute) AS dia,
       round((100.0 * sum(packets_lost_in) / nullif(sum(packets_in) + sum(packets_lost_in), 0))::numeric, 2) AS perda_subida_pct,
       round((100.0 * sum(packets_lost_out) / nullif(sum(packets_out) + sum(packets_lost_out), 0))::numeric, 2) AS perda_descida_pct,
       sum(nack) AS nack, sum(pli) AS pli
FROM livekit_metrics WHERE up GROUP BY 1 ORDER BY 1;
```

**Lives recentes (quem transmitiu), com % abaixo do alvo e limitação:**
```sql
SELECT u.username, s.started_at, coalesce(s.ended_at, s.last_seen_at) - s.started_at AS duracao,
       mode() WITHIN GROUP (ORDER BY x.codec) AS codec,
       round(100 * avg(CASE WHEN x.hardware THEN 1.0 WHEN NOT x.hardware THEN 0.0 END)) AS na_placa_pct,
       round(100 * avg(CASE WHEN x.target_fps > 0 THEN
             CASE WHEN x.fps < 0.8 * x.target_fps OR x.step > 0 THEN 1.0 ELSE 0.0 END END)) AS abaixo_do_alvo_pct,
       round(100 * avg(CASE WHEN x.limitation = 'cpu' THEN 1.0 ELSE 0.0 END)) AS cpu_pct,
       round(100 * avg(CASE WHEN x.limitation = 'bandwidth' THEN 1.0 ELSE 0.0 END)) AS banda_pct,
       sum(x.step_changes) AS trocas_de_degrau, s.os, s.gpu
FROM live_sessions s JOIN users u ON u.id = s.user_id JOIN live_samples x ON x.session_id = s.id
WHERE s.kind = 'transmite'
GROUP BY s.id, u.username ORDER BY s.started_at DESC LIMIT 30;
```

**Quem assistiu cada live e como foi:**
```sql
SELECT t.username AS transmitiu, v.username AS assistiu, w.started_at,
       round((60.0 * sum(x.freezes) / nullif(sum(x.seconds), 0))::numeric, 2) AS congelamentos_min,
       round(avg(x.fps)::numeric) AS fps, round(avg(x.loss_pct)::numeric, 2) AS perda_pct,
       bool_or(NOT x.hardware) AS decodificou_no_processador,
       round(100 * avg(CASE WHEN x.paused THEN 1.0 ELSE 0.0 END)) AS pausada_pct,
       mode() WITHIN GROUP (ORDER BY x.transport) AS conexao
FROM live_sessions w
JOIN users v ON v.id = w.user_id JOIN users t ON t.id = w.streamer_id
JOIN live_samples x ON x.session_id = w.id
WHERE w.kind = 'assiste'
GROUP BY w.id, t.username, v.username ORDER BY w.started_at DESC LIMIT 50;
```

**Quantas conexões caem no TCP/TURN** (vale TURN/TLS na 443?):
```sql
SELECT transport, count(DISTINCT session_id) AS sessoes
FROM live_samples WHERE transport <> '' GROUP BY 1 ORDER BY 2 DESC;
```

**Quem decodifica/codifica no processador, por sistema e placa:**
```sql
SELECT s.kind, s.os, s.gpu, count(DISTINCT s.id) AS sessoes,
       round(100 * avg(CASE WHEN NOT x.hardware THEN 1.0 WHEN x.hardware THEN 0.0 END)) AS no_processador_pct
FROM live_sessions s JOIN live_samples x ON x.session_id = s.id
WHERE s.kind IN ('transmite', 'assiste')
GROUP BY 1, 2, 3 ORDER BY sessoes DESC;
```

**Distribuição por codec (o que as placas escolhem de fato):**
```sql
SELECT codec, count(DISTINCT session_id) AS sessoes, round(avg(fps)::numeric) AS fps,
       round(avg(bitrate_kbps)::numeric) AS kbps
FROM live_samples WHERE codec <> '' GROUP BY 1 ORDER BY 2 DESC;
```

**Onde os quadros da live se perdem** (captura → codificador → quem assiste):
```sql
SELECT u.username, s.kind, s.started_at, s.gpu,
       round(avg(x.target_fps)) AS alvo, round(avg(x.capture_fps)::numeric, 1) AS captura,
       round(avg(x.fps)::numeric, 1) AS fps, round(avg(x.recv_fps)::numeric, 1) AS chegam,
       round(avg(x.codec_ms)::numeric, 1) AS ms_por_quadro, sum(x.freezes) AS congelamentos
FROM live_sessions s JOIN users u ON u.id = s.user_id JOIN live_samples x ON x.session_id = s.id
WHERE s.kind IN ('transmite', 'assiste') AND x.seconds > 0
GROUP BY s.id, u.username ORDER BY s.started_at DESC LIMIT 30;
```

**Por que cada live saiu naquele codec:**
```sql
SELECT e.at, u.username, s.os, s.gpu, e.detail
FROM live_events e JOIN live_sessions s ON s.id = e.session_id JOIN users u ON u.id = s.user_id
WHERE e.type = 'codec_escolhido' ORDER BY e.at DESC LIMIT 30;
```

**Congelamentos de quem assiste × captura de quem transmite** (mesmo intervalo de 20 s;
todos os espectadores congelando juntos com perda 0 e a captura caindo = a origem é
a captura de quem transmite, não a rede nem o decodificador):
```sql
WITH tx AS (SELECT s.id, s.call_id, s.user_id, x.at, x.capture_fps, x.target_fps
            FROM live_sessions s JOIN live_samples x ON x.session_id = s.id
            WHERE s.kind = 'transmite' AND x.seconds > 0)
SELECT u.username AS transmitiu, date_trunc('minute', tx.at) AS minuto,
       round(avg(tx.capture_fps)::numeric, 1) AS captura, max(tx.target_fps) AS alvo,
       round(avg(x.freezes)::numeric, 1) AS congelamentos_por_20s,
       round(avg(x.loss_pct)::numeric, 2) AS perda, count(DISTINCT w.id) AS espectadores
FROM tx JOIN users u ON u.id = tx.user_id
JOIN live_sessions w ON w.kind = 'assiste' AND w.streamer_id = tx.user_id AND w.call_id = tx.call_id
JOIN live_samples x ON x.session_id = w.id AND x.seconds > 0 AND abs(extract(epoch FROM x.at - tx.at)) < 10
GROUP BY 1, 2 ORDER BY 2 DESC LIMIT 60;
```

**Captura abaixo do alvo por pessoa** (Windows: o capturador do Chromium baixa o fps
quando copiar o quadro custa caro; em 02/11/2026 metade das pessoas transmitia
abaixo de 80% do alvo, com `limitation = none`):
```sql
SELECT u.username, s.gpu, x.target_fps AS alvo, count(*) AS amostras,
       round(avg(x.capture_fps / x.target_fps)::numeric, 2) AS captura_sobre_alvo,
       round(stddev(x.capture_fps)::numeric, 1) AS oscilacao
FROM live_sessions s JOIN users u ON u.id = s.user_id JOIN live_samples x ON x.session_id = s.id
WHERE s.kind = 'transmite' AND x.seconds > 0 AND x.target_fps > 0 AND x.capture_fps > 0
GROUP BY 1, 2, 3 HAVING count(*) > 5 ORDER BY 5;
```

**Som da live** (app com a ADR 0047 em diante: `som: janela|sistema|nenhum` no fim
do `codec_escolhido`; cruzar com quem reclamou de voz duplicada):
```sql
SELECT e.at, u.username, substring(e.detail FROM 'som: (\w+)') AS som
FROM live_events e JOIN live_sessions s ON s.id = e.session_id JOIN users u ON u.id = s.user_id
WHERE e.type = 'codec_escolhido' AND e.detail LIKE '%som:%' ORDER BY e.at DESC LIMIT 30;
```

**Voz: quem ouve robotizado e por quê** (síntese com perda = rede; sem perda = PC):
```sql
SELECT u.username, s.os, s.started_at,
       round(avg(x.concealed_pct)::numeric, 2) AS sintetizado_pct,
       round(avg(x.recv_loss_pct)::numeric, 2) AS perda_recebida_pct,
       round(avg(x.loss_pct)::numeric, 2) AS perda_subida_pct,
       max(x.connect_ms) AS entrou_ms
FROM live_sessions s JOIN users u ON u.id = s.user_id JOIN live_samples x ON x.session_id = s.id
WHERE s.kind = 'call' GROUP BY s.id, u.username
ORDER BY sintetizado_pct DESC NULLS LAST LIMIT 30;
```

**Voz que não conectou ou caiu** (muitas ao mesmo tempo = servidor):
```sql
SELECT date_trunc('minute', e.at) AS minuto, e.type, count(*) AS quantas,
       string_agg(DISTINCT u.username, ', ') AS quem, min(e.detail) AS exemplo
FROM live_events e JOIN live_sessions s ON s.id = e.session_id JOIN users u ON u.id = s.user_id
WHERE e.type IN ('conexao_falhou', 'reconectou')
GROUP BY 1, 2 ORDER BY 1 DESC LIMIT 50;
```
Sessões de voz do app antigo que nunca conectaram aparecem sem transporte em
nenhuma amostra (`bool_and(transport = '')`).

**Eventos das últimas 24 h, por tipo:**
```sql
SELECT type, count(*) FROM live_events WHERE at > now() - interval '24 hours' GROUP BY 1 ORDER BY 2 DESC;
```

**Linha do tempo de uma live** (troque o id):
```sql
SELECT at, fps, target_fps, height, bitrate_kbps, limitation, step, backup, layers, transport
FROM live_samples WHERE session_id = '<id>' ORDER BY at;
SELECT at, type, detail FROM live_events WHERE session_id = '<id>' ORDER BY at;
```

## Onde agir (como ler)

| Sinal | Provável causa | O que fazer |
|---|---|---|
| `limitation = cpu` alto em quem transmite, `na_placa_pct` baixo | encoder por software | conferir placa/driver; codec que a placa codifica |
| `limitation = bandwidth` alto | upload de quem transmite | preset menor ou camada de 720p |
| perda na **subida** alta (`packets_lost_in`) | rede de quem transmite | idem; ver `transport` (TCP piora) |
| perda na **descida** alta, `paused` em quem assiste | rede de quem assiste / banda da VPS | camada de 720p (simulcast); conferir `mbps_saida` perto do limite da VPS |
| `decodificou_no_processador` em quem tem congelamentos | decodificador por software | driver (ex.: nvidia-vaapi-driver no Linux), codec mais leve |
| `backup` alto | alguém sem o codec principal | ver quem (SO/placa) e a ordem de codecs |
| muitas sessões `tcp`/`relay` | rede bloqueando UDP | TURN/TLS na 443 (relatório da investigação §3.8) |
| CPU da VPS > 80% ou `mbps_saida` no teto do plano | VPS no limite | VPS maior, teto de bitrate, simulcast |
| `capture_fps` < 80% do alvo, `limitation = none` | a captura do Chromium não entrega o fps | captura nativa (ADR 0031) ou outra fonte; codec/bitrate não resolvem |
| `codec_ms` (transmite) perto de 1000/alvo | codificador não dá conta | preset menor ou outro codec para aquela placa |
| quem assiste: `recv_fps` ≫ `fps`, congelamentos | decodificador | tirar o codec da ordem para aquela placa/SO; driver |
| quem assiste: `recv_fps` baixo com perda 0 | não chega: quem transmite ou SFU | comparar com o `fps`/`capture_fps` de quem transmite e a pausa/camada |
| todos os espectadores congelam juntos, perda 0, e a `capture_fps` de quem transmite oscila | a captura do Chromium no Windows (cópia do quadro para a CPU + teto de 50% de CPU do capturador) | não é rede nem codec: captura nativa no Windows (marco 2 da ADR 0031) |
| `codec_escolhido` com "caiu no proc." ou "—" numa placa boa | marca permanente ou o Chromium sem encoder | limpar a marca; Linux/NVIDIA → motor nativo |
| `concealed_pct` ≥ 3% com `recv_loss_pct` alto | rede de quem ouve | TCP/TURN? (o RED já está ligado) |
| `concealed_pct` ≥ 3% sem perda | PC de quem ouve (CPU, DSP de áudio) | rever o custo do processamento local (ADR 0005) |
| vários `conexao_falhou` "entrando (mídia)" no mesmo minuto | servidor (IP anunciado, firewall, LiveKit) | conferir `LIVEKIT_NODE_IP`/portas; reverter a mudança |
| `conexao_falhou` de uma pessoa só, etapa mídia | UDP bloqueado na rede dela | TURN/TLS na 443 |
| `reconectou` em muitas sessões juntas | reinício/queda do LiveKit | não rodar `--infra` com gente na call |

**Na VPS, se a perda na subida subir com lives pesadas:** o LiveKit avisa no
boot que o buffer de UDP é pequeno (425 984 × 5 000 000 sugeridos); confira
`grep -A1 '^Udp:' /proc/net/snmp` (coluna `RcvbufErrors`). Em 30/10/2026
eram 10 em 5 dias (sem efeito).
