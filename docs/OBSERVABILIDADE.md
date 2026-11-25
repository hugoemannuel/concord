# Observabilidade das lives

O que existe para saber como as lives e calls estão de fato, e onde agir.
Decisão e alternativas: [ADR 0029](adr/0029-observabilidade-das-lives.md); os
sinais de qualidade (cada um com a pergunta e a ação que ele habilita):
[ADR 0032](adr/0032-sinais-de-qualidade-das-lives-e-calls.md); o app Android:
[ADR 0070](adr/0070-telemetria-de-calls-e-lives-no-android.md).
Como ligar na VPS: [HOSPEDAGEM.md](HOSPEDAGEM.md#métricas-do-livekit-observabilidade-das-lives).
Os erros do app (desktop, web, Android e panics do backend) estão em [Erros do app](#erros-do-app).

## O que é coletado

| Fonte | Tabela | De quanto em quanto | O quê |
|---|---|---|---|
| LiveKit (`/metrics`, Prometheus em 127.0.0.1) + `/proc` da VPS | `livekit_metrics` | 1 min | banda entrando/saindo, retransmissões, perda na subida (quem publica → SFU) e na descida (SFU → quem assiste), NACK, PLI, RTT, jitter, nota de qualidade, salas, participantes, tracks, CPU e memória do LiveKit e da VPS |
| App (quem transmite) | `live_sessions` (`transmite`) + `live_samples` | 20 s | codec, placa ou processador, resolução e fps codificados × escolhidos, **fps da captura** (`capture_fps`), **ms por quadro no codificador** (`codec_ms`), Mbps, `qualityLimitationReason`, degrau do controlador e trocas, camadas, reserva, quadros-chave, PLI, NACK, UDP/TCP/TURN |
| App (quem assiste) | `live_sessions` (`assiste`) + `live_samples` | 20 s | codec, decodificador na placa ou no processador, resolução, **quadros/s que chegaram** (`recv_fps`) × decodificados (`fps`), **ms por quadro no decodificador** (`codec_ms`), perda, jitter, congelamentos, quadros descartados, pausa do servidor, UDP/TCP/TURN |
| App (voz) | `live_sessions` (`call`) + `live_samples` | 60 s | RTT, perda e jitter vistos pelo servidor, UDP/TCP/TURN; **o que eu ouço**: % de áudio sintetizado (`concealed_pct`) e perda no áudio recebido (`recv_loss_pct`); **tempo para conectar** (`connect_ms`) |
| App e servidor | `live_events` | quando acontece | início, fim, qualidade caiu/voltou, reserva ligada, codificador/decodificador no processador, codec trocou, **codec escolhido (e por quê)**, congelamento longo (≥ 2 s em 20 s), pausada pelo servidor, **voz não conectou (etapa e motivo)**, **voz reconectou (tempo fora)**; do Android: **saiu do app** (`segundo_plano`), **voltou ao app** (`primeiro_plano`, tempo fora), **trocou de rede** (`rede_trocou`, `wifi → cellular-4g`), **saída do áudio** (`rota_do_audio`: `bluetooth`, `headset`, `speaker`, `earpiece`) |

Contexto de cada sessão: SO, versão do app, plataforma (`target`: `desktop`,
`web` ou `android`; o backend descarta outro valor), placa de vídeo (renderer
do WebGL), núcleos do processador, tipo de rede (quando o navegador conta) e,
no Android, o aparelho (`device`, fabricante e modelo).
Nada do que se fala, escreve ou mostra. Tudo fica 14 dias (o backend apaga de
hora em hora). Visitante sem conta não manda.

Nos contadores das amostras (`freezes`, `freeze_ms`, `frames_dropped`,
`key_frames`, `pli`, `nack`, `step_changes`) o valor é a diferença no intervalo
`seconds`. `fps`, `capture_fps`, `recv_fps`, `codec_ms`, `concealed_pct` e
`recv_loss_pct` são médias do intervalo (a partir do app com a ADR 0032; antes,
`fps` era o do momento da leitura); o resto é o valor no momento. A primeira amostra de cada sessão é a
base (contadores zerados, `seconds = 0`).

### O que o app Android manda (e o que não manda)

A mesma rota e o mesmo formato do desktop (`mobile/src/features/observability/`,
cópia adaptada), para a **call de voz**, a **live assistida** e a **tela
transmitida**, no mesmo ritmo (voz a cada 60 s, live a cada 20 s, num pedido
só). O timer só existe com a call em andamento; ao sair, uma última leitura
manda o fim. Fora de call não lê, não ouve e não manda nada.

| Campo | No Android |
|---|---|
| `os` | `Android 14` (a versão do sistema) |
| `app_version` | a do `app.config.ts` (hoje fixa em `0.1.0`: não separa builds) |
| `target` | `android` |
| `device` | fabricante e modelo (`samsung SM-A515F`), do `Platform.constants` |
| `network` | `wifi`, `cellular-4g`, `cellular-5g`, `cellular`, `none`... (NetInfo); atualizado a cada envio |
| `gpu`, `cores` | vazio e 0 (sem API no React Native) |
| voz: RTT, perda, jitter, transporte, `concealed_pct`, `recv_loss_pct`, `connect_ms` | iguais ao desktop (o `getStats()` do libwebrtc nativo usa os nomes do W3C) |
| `connect_ms` | de "entrando" até a voz conectar (numa DM, conta do atender) |
| `conexao_falhou` | `entrando (acesso)`: o nosso servidor, só rede ou erro 5xx (sala trancada e sem permissão não contam); `entrando (voz)`: o LiveKit; `conectada: caiu`, `reconectando: caiu`. Não contam: sair, cancelar no meio da entrada, entrar em outro aparelho, ser tirado da sala pelo servidor |
| live: codec, placa/processador, resolução, fps, `capture_fps`, `recv_fps`, `codec_ms`, perda, jitter, congelamentos, pausa | iguais ao desktop; placa × processador pelo nome do MediaCodec quando o WebRTC não diz (`c2.qti...`, `OMX.Exynos...` = placa; `c2.android...`, `OMX.google...`, `libvpx` = processador) |
| `streamer_id` (live do helper nativo, `<id>:screen`) | o dono da live (sem o sufixo) |
| `target_fps` (minha tela) | o fps pedido na publicação; null se for o padrão do SDK |
| degrau, trocas de degrau, reserva, `codec_escolhido`, `target_height` | não manda (o app não tem controlador, reserva nem escolha de codec) |

A saída do áudio é **inferida**: das saídas disponíveis, a que o AudioSwitch do
LiveKit escolhe (Bluetooth > fone com fio > alto-falante > auricular; o app não
tem seletor). Entrada que falhou antes da primeira leitura vira uma sessão de
voz só com os eventos e o fim (`call_id` vazio).

Não manda: bateria, temperatura, modo de economia, intensidade do sinal,
operadora, SSID, IP (ADR 0070, "Fora").

## Painel

`/observabilidade` no app (no navegador: `https://<app>/observabilidade`), só
para quem está em `dev_badge_users` ([como conceder](HOSPEDAGEM.md#badge-fundador-devs)).
Não tem link no app. É dividido em abas; a aba e o período ficam na URL, para
mandar o link de uma aba: `/observabilidade/<aba>?dias=7` (sem aba, abre a
primeira; períodos: 24 h, 3, 7 ou 14 dias, valendo para todas as abas).

- **Lives** (`lives`): lives recentes (quem, quando, duração, codec, % na placa,
  % abaixo do alvo — fps < 80% do escolhido ou degrau abaixo do escolhido —,
  limitação por CPU/banda, espectadores, congelamentos por minuto e %
  decodificando no processador entre os espectadores) e as **piores lives e
  por quê** (de quem transmite e de quem assiste).
- **Chamadas** (`chamadas`): as **piores chamadas e por quê** (voz das calls).
- **Servidor** (`servidor`): em blocos **VPS** (CPU com steal, RAM e swap, disco,
  rede, backup, último boot, banco), **API** (pedidos por minuto, 5xx, latência,
  rotas mais lentas e com erro, WebSockets, pool do banco, panics) e **LiveKit**
  (picos de saída, pessoas, perda na descida; banda e CPU). Ver
  [Servidor: API e VPS](#servidor-api-e-vps).
- **Distribuição** (`distribuicao`) por sistema, placa de vídeo, codec e
  conexão; e, com as calls, por plataforma (desktop, web, android), rede e
  aparelho Android.
- **Eventos** (`eventos`): as **quedas e falhas da voz do período inteiro**
  (`call_events`: `reconectou`, `conexao_falhou`, `retomou`; até 300) e os 100
  eventos mais recentes das lives e calls (quase todos congelamentos longos, ~310
  por dia: sem a lista à parte, as quedas da voz sumiam em poucas horas).
- **Erros** (`erros`): os erros do app agrupados (ver [Erros do app](#erros-do-app)).
- **Alertas** (`alertas`): o que está disparado agora, quantas vezes cada regra
  disparou no período (recorrência) e o histórico (regra, gravidade, de quando
  a quando). Pedido próprio: `GET /api/obs/alerts?days=N`. Ver [Alertas](#alertas).

Piores sessões: pontuação e os motivos prováveis, com a linha de números da
sessão (captura × codificado, chegam × decodificados, ms por quadro; na voz,
áudio sintetizado, perda recebida, minutos de voz ruim, tempo para entrar) e de
onde veio (plataforma, aparelho e rede). No Android, dois motivos a mais: "Caiu
com o app em segundo plano" e "Caiu ao trocar de rede" (só quando a voz
reconectou ou não conectou). São
**duas listas**, cada uma com o seu teto, porque as escalas não se comparam:
`worst_lives` (15, quem transmite e quem assiste: abaixo do alvo, congelamentos,
perda, CPU/banda, processador) e `worst_calls` (10, a voz). A voz pontua por
**minutos ruins** (minuto medido com áudio sintetizado ≥ 3% ou perda recebida ≥
5%) × 10, reconexões × 20 e falhas × 100, e não pela média da sessão (que dilui
um episódio longo: a pior call de 13/11, 48 minutos robotizados, ficava em 63º).
A `conexao_falhou` na etapa de **acesso** ("entrando (acesso)": chamada encerrada
ou sem permissão) não é queda: vai à parte (`access_failures`) e não pesa. O
campo antigo `worst` leva as duas listas juntas, para o app de antes.

As abas Lives, Chamadas, Servidor, Distribuição e Eventos usam o mesmo pedido
(`useSharedLiveReport`): trocar entre elas não busca de novo. A aba Servidor
busca também os blocos VPS e API (`GET /api/obs/server`, hook `useServerReport`).

**Aba nova** = uma entrada em
`frontend/src/renderer/src/features/observability/lib/panelTabs.tsx`
(`{ id, label, Component }`): `id` vira a URL, `Component` recebe `{ days }` e
busca os próprios dados (hook próprio, com os estados de carregando, sem
permissão e erro). Não precisa mexer no `router.tsx` nem na página.

O mesmo JSON: `GET /api/obs/lives?days=7` (token de um dev).

## Alertas

Avisos no servidor dos devs ([ADR 0071](adr/0071-alertas-em-canais-do-servidor-dos-devs.md)).
Com `ALERTS_SERVER_ID` (id do servidor "Devs Salinha"), o backend garante no
boot a categoria **Monitoramento** com os canais de sistema `#alertas` (infra e
serviços), `#erros` (erros do app, parte 2), `#qualidade` (calls e lives) e
`#resumo-diario` (parte 2), e escreve neles como **Salinha Bot**. Vazio = tudo
desligado (o padrão). Como ligar: [HOSPEDAGEM.md](HOSPEDAGEM.md#alertas-no-servidor-dos-devs).

**Como avisa**: uma mensagem ao disparar, uma se piorar (aviso → crítico), uma
ao normalizar ("Normalizou: … Durou X"), um lembrete a cada 6 h se continuar e
no máximo 10 mensagens por hora por canal (o resto só no log e no painel; o
crítico sempre passa).
**Aviso** é só a mensagem; **crítico** começa com `@all` e chega como push para
todos do servidor (respeitando o silenciar de cada um). O estado (incidente
aberto) fica em `alert_incidents`: reiniciar o backend não repete o aviso.

| Regra (`id`) | Canal | Aviso | Crítico | Normaliza |
|---|---|---|---|---|
| Backend subiu / ficou fora (`backend_down`) | alertas | a cada boot: versão e, sem parada limpa, de quando a quando ficou fora (pelo último minuto do `livekit_metrics`) | — | (evento) |
| Backend reiniciando sem parar (`restart_loop`) | alertas | — | 3 boots sem parada limpa em 10 min (os "backend no ar" de cada volta não saem) | menos de 3 em 10 min |
| CPU da máquina (`host_cpu`) | alertas | ≥ 85% por 5 min | ≥ 95% por 10 min | abaixo por 3 min |
| Memória da máquina (`host_mem`) | alertas | ≥ 90% por 5 min | ≥ 95% por 5 min | abaixo por 3 min |
| LiveKit fora do ar (`livekit_down`) | alertas | `up = false` por 3 min | por 5 min | respondeu por 1 min |
| CPU do LiveKit (`livekit_cpu`) | alertas | ≥ 150% de uma vCPU por 5 min | — | abaixo por 3 min |
| Banco fora do ar (`database_down`) | alertas | quando volta: de quando a quando (3 pings de 15 s sem resposta) | — | (evento) |
| Serviço do systemd falhou (`unit_failed`) | alertas | `OnFailure=` de `concord-*`/`salinha-*` (backup, yt-dlp, firewall); a mesma unidade de novo em 1 h só vai para o histórico | — | (evento) |
| Voz sem conectar (`call_failures`) | qualidade | — | 3+ pessoas com `conexao_falhou` na etapa de mídia em 5 min | abaixo por 10 min |
| Voz reconectando em massa (`call_reconnects`) | qualidade | 4+ pessoas com `reconectou` em 3 min | — | abaixo por 10 min |

Os números estão em constantes no começo de cada `backend/internal/alert/rule_*.go`.
O LiveKit fora só avisa se ele respondeu alguma vez na última hora (sem o
Prometheus ligado ele estaria "fora" para sempre); fora há mais de 1 h, o
incidente fica aberto sem lembrete até ele voltar. Todo membro do servidor de
`ALERTS_SERVER_ID` vê os canais (canal de sistema não tem permissão própria):
use um servidor só dos devs. O backup que roda e não gera
arquivo fica para a parte 2 (idade do arquivo, coletada pela tarefa obs-servidor).

**Limite**: o alerta é postado pelo próprio backend, então **não avisa enquanto
a VPS, o backend ou o banco estão fora**: só quando voltam ("ficou fora de X a
Y"). Avisar na hora pede um monitor externo.

**Silenciar**: cada dev silencia o canal ou o servidor no app (vale para o
push do crítico também). Para desligar uma regra para todos, ponha o id em
`ALERTS_MUTED` no `/opt/concord/.env` (ex.: `ALERTS_MUTED=livekit_cpu,host_cpu`)
e reinicie o backend: a regra segue gravando no painel, só não posta.

**Criar uma regra**: um arquivo `backend/internal/alert/rule_<nome>.go` com o
construtor e uma linha na lista de `rules.go`:

```go
func diskRule(src diskSource) Rule {
	return Rule{
		ID: "host_disk", Title: "Disco da máquina", Channel: ChannelInfra, Tab: "servidor",
		Hold: Hold{Warning: 10 * time.Minute, Critical: 10 * time.Minute, Clear: 10 * time.Minute},
		Check: func(ctx context.Context, now time.Time) (Reading, error) {
			pct, err := src.DiskUsedPercent(ctx) // só a última linha
			if err != nil {
				return Reading{Level: LevelUnknown}, err
			}
			return levelFor(pct, limits{warn: 85, crit: 95}, "disco em %.0f%% (limite %.0f%%)"), nil
		},
	}
}
```

`Check` lê só as últimas linhas e diz o nível de agora (`LevelOK`, `LevelWarning`,
`LevelCritical` ou `LevelUnknown` sem dado); `Hold` é a histerese (quanto cada
nível precisa durar antes de valer) e o motor cuida do resto (estado, mensagens,
teto). A fonte nova entra na interface `Sources` de `rules.go`, implementada pelo
`Repository`. Acontecimento de uma vez (não uma condição) vai por
`Engine.Notify(Event{...})`. Os textos ficam em `messages.go` (ou no `Text` da
leitura) e precisam de aprovação. O teste da regra usa uma fonte falsa
(`rules_test.go`).

**Consultas**: `SELECT rule_id, severity, started_at, ended_at, text FROM
alert_incidents ORDER BY started_at DESC LIMIT 50;` e `SELECT * FROM
backend_runs ORDER BY id DESC LIMIT 20;` (boots; `stopped_at` nulo = queda).

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

**Android × desktop × web na voz** (ADR 0070):
```sql
SELECT s.target, s.network, count(DISTINCT s.id) AS sessoes,
       round(avg(x.concealed_pct)::numeric, 2) AS sintetizado_pct,
       round(avg(x.recv_loss_pct)::numeric, 2) AS perda_recebida_pct,
       round(avg(x.rtt_ms)::numeric) AS rtt_ms,
       count(*) FILTER (WHERE e.type = 'reconectou') AS reconexoes,
       count(*) FILTER (WHERE e.type = 'conexao_falhou') AS falhas
FROM live_sessions s
LEFT JOIN live_samples x ON x.session_id = s.id AND x.seconds > 0
LEFT JOIN live_events e ON e.session_id = s.id AND e.type IN ('reconectou', 'conexao_falhou')
WHERE s.kind = 'call' GROUP BY 1, 2 ORDER BY 3 DESC;
```

**Call no Android: o que aconteceu, na ordem** (segundo plano, troca de rede,
saída do áudio e quedas):
```sql
SELECT e.at, u.username, s.device, e.type, e.detail
FROM live_events e JOIN live_sessions s ON s.id = e.session_id JOIN users u ON u.id = s.user_id
WHERE s.target = 'android' AND e.type IN ('segundo_plano', 'primeiro_plano', 'rede_trocou',
      'rota_do_audio', 'reconectou', 'conexao_falhou')
ORDER BY e.at DESC, e.id DESC LIMIT 100;
```

**Leitura que demorou em segundo plano** (o JavaScript foi pausado: o serviço em
primeiro plano não segurou; a voz sai a cada 60 s):
```sql
SELECT u.username, s.device, x.at, x.seconds
FROM live_samples x JOIN live_sessions s ON s.id = x.session_id JOIN users u ON u.id = s.user_id
WHERE s.target = 'android' AND s.kind = 'call' AND x.seconds > 120
ORDER BY x.at DESC LIMIT 50;
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
| Android: queda logo depois de `segundo_plano`, ou amostra de voz com `seconds` ≫ 60 | o serviço em primeiro plano não segurou (economia de bateria do fabricante) | ver o aparelho (`device`); instrução para liberar o app da otimização de bateria ou rever o serviço (ADR 0030) |
| Android: queda junto de `rede_trocou` | troca de IP (Wi-Fi ↔ dados) | não é o servidor; ver se o LiveKit reconecta (`reconectou`) ou cai |
| Android: `concealed_pct` alto só com `rota_do_audio = bluetooth` | perfil de voz do fone Bluetooth (HFP) | não é a rede; orientar fone com fio/alto-falante |
| piora só numa `target` ou num `device` | o app/SDK daquela plataforma ou o aparelho | exceção de codec/qualidade para ele |

**Na VPS, se a perda na subida subir com lives pesadas:** o LiveKit avisa no
boot que o buffer de UDP é pequeno (425 984 × 5 000 000 sugeridos); confira
`grep -A1 '^Udp:' /proc/net/snmp` (coluna `RcvbufErrors`). Em 30/10/2026
eram 10 em 5 dias (sem efeito).

## Servidor: API e VPS

Desde a [ADR 0067](adr/0067-metricas-da-api-e-da-vps.md) o backend guarda também a
saúde da API e da máquina, para responder o que aconteceu numa queda ou lentidão
(como os 16 minutos fora em 24/11/2026). Tudo lido pelo próprio backend (middleware
do gin, `runtime`, `pgxpool.Stat`, `/proc` e `statfs`), 14 dias de retenção.

| Tabela | De quanto em quanto | O quê |
|---|---|---|
| `api_metrics` | 1 min | pedidos, por classe (2xx, 3xx, 4xx, 5xx), latência p50/p95/p99/máx (ms, por baldes; o máx é exato), pedidos em andamento (agora e o máximo do minuto), **panics**, WebSockets abertos e quantos entraram/saíram, goroutines, heap e `Sys` do Go, ciclos e pausa de GC, pool do Postgres (em uso, ociosas, total, máximo, esperas por conexão e quanto tempo esperaram) |
| `api_route_metrics` | 5 min, até 20 rotas | por rota (método + padrão do gin, ex. `GET /api/channels/:id/messages`, nunca a URL): pedidos, 4xx, 5xx, p50, p95, máx e tempo total; as com 5xx primeiro, depois as que mais gastaram tempo |
| `host_metrics` | 1 min | CPU (uso, `iowait`, `steal`), carga 1/5/15, RAM usada (%) e disponível, swap, disco da pasta de dados (usado/livre, %, inodes, leitura/escrita por segundo, % ocupado), rede da interface principal (bytes e pacotes por segundo, erros, descartes), erros UDP do kernel (`InErrors`, `RcvbufErrors`, `SndbufErrors`), CPU e memória do backend e do Postgres, tamanho do banco e conexões, idade e tamanho do backup mais novo, hora do boot |
| `db_table_sizes` | 1 h | as 10 maiores tabelas (com índices) |

Fora da conta da API: `/healthz`, os downloads longos (`/updates/*`, mídia do chat) e
o `/rtc` do LiveKit. O `/ws` conta como conexão, não como pedido. `minute` é o
minuto da coleta (os números são do minuto anterior a ele); nas rotas, o fim da
janela de 5 min. Nulo = não deu para ler (ex.: Windows em dev). CPU de processo
em % da máquina inteira (100% = as 2 vCPUs). Um buraco nas duas tabelas = o
backend estava fora; `boot_at` mudou = a máquina reiniciou.

**Painel:** aba **Servidor** de `/observabilidade`, em blocos VPS, API e LiveKit.
O mesmo JSON: `GET /api/obs/server?days=7` (token de um dev).

### Consultas prontas (psql)

**O que aconteceu na última hora** (um buraco de minutos = backend fora):
```sql
SELECT a.minute, a.requests, a.status_5xx, round(a.p95_ms::numeric) AS p95_ms, a.panics,
       a.ws_open, a.db_in_use, a.db_waits, round(h.cpu_pct::numeric) AS cpu,
       round(h.steal_pct::numeric, 1) AS steal, round(h.mem_used_pct::numeric) AS ram,
       round(h.swap_used_mb::numeric) AS swap_mb, h.boot_at
FROM api_metrics a LEFT JOIN host_metrics h USING (minute)
WHERE a.minute > now() - interval '1 hour' ORDER BY a.minute;
```

**Buracos (backend fora) nos últimos 14 dias:**
```sql
SELECT minute AS voltou, minute - prev AS ficou_fora
FROM (SELECT minute, lag(minute) OVER (ORDER BY minute) AS prev FROM api_metrics) x
WHERE minute - prev > interval '2 minutes' ORDER BY minute DESC;
```

**Reinícios da máquina:**
```sql
SELECT DISTINCT boot_at FROM host_metrics WHERE boot_at IS NOT NULL ORDER BY 1 DESC;
```

**Rotas com mais 5xx e mais lentas (últimas 24 h):**
```sql
SELECT route, sum(requests) AS pedidos, sum(status_5xx) AS erros_5xx,
       round((sum(total_ms) / nullif(sum(requests), 0))::numeric, 1) AS media_ms,
       round(max(p95_ms)::numeric) AS p95_ms, round(max(max_ms)::numeric) AS max_ms
FROM api_route_metrics WHERE minute > now() - interval '24 hours'
GROUP BY 1 ORDER BY erros_5xx DESC, sum(total_ms) DESC LIMIT 20;
```

**API por hora (pedidos, 5xx, latência, pool):**
```sql
SELECT date_trunc('hour', minute) AS hora, sum(requests) AS pedidos, sum(status_5xx) AS erros_5xx,
       round(max(p95_ms)::numeric) AS pior_p95_ms, sum(panics) AS panics,
       max(ws_open) AS ws_max, max(db_in_use) AS banco_max, sum(db_waits) AS esperas_banco,
       max(goroutines) AS goroutines_max, round(max(heap_mb)::numeric) AS heap_mb_max
FROM api_metrics WHERE minute > now() - interval '24 hours' GROUP BY 1 ORDER BY 1;
```

**Quedas de WebSocket em massa** (todo mundo saindo no mesmo minuto):
```sql
SELECT minute, ws_open, ws_connects, ws_disconnects FROM api_metrics
WHERE ws_disconnects > 5 ORDER BY minute DESC LIMIT 30;
```

**VPS por hora (CPU, steal, RAM, swap, disco, rede):**
```sql
SELECT date_trunc('hour', minute) AS hora, round(avg(cpu_pct)::numeric) AS cpu, round(max(cpu_pct)::numeric) AS cpu_max,
       round(max(steal_pct)::numeric, 1) AS steal_max, round(max(iowait_pct)::numeric, 1) AS iowait_max,
       round(max(mem_used_pct)::numeric) AS ram_max, round(max(swap_used_mb)::numeric) AS swap_mb,
       round(max(disk_used_pct)::numeric) AS disco, round((max(net_tx_bps) * 8 / 1e6)::numeric, 1) AS mbps_saida_max,
       sum(udp_rcvbuf_errors) AS udp_rcvbuf
FROM host_metrics WHERE minute > now() - interval '24 hours' GROUP BY 1 ORDER BY 1;
```

**Quem come a máquina** (backend × Postgres; o LiveKit está em `livekit_metrics`):
```sql
SELECT date_trunc('hour', h.minute) AS hora, round(avg(h.cpu_pct)::numeric) AS vps,
       round(avg(h.backend_cpu_pct)::numeric, 1) AS backend, round(avg(h.postgres_cpu_pct)::numeric, 1) AS postgres,
       round(avg(l.livekit_cpu_pct / 2)::numeric, 1) AS livekit,  -- livekit_cpu_pct é % de 1 vCPU
       round(max(h.backend_mem_mb)::numeric) AS backend_mb, round(max(h.postgres_mem_mb)::numeric) AS postgres_mb
FROM host_metrics h LEFT JOIN livekit_metrics l USING (minute)
WHERE h.minute > now() - interval '24 hours' GROUP BY 1 ORDER BY 1;
```

**Backup e banco agora:**
```sql
SELECT minute, backup_at, now() - backup_at AS idade, pg_size_pretty(backup_bytes) AS backup,
       pg_size_pretty(db_size_bytes) AS banco, db_connections
FROM host_metrics ORDER BY minute DESC LIMIT 1;
SELECT table_name, pg_size_pretty(total_bytes) FROM db_table_sizes
WHERE hour = (SELECT max(hour) FROM db_table_sizes) ORDER BY total_bytes DESC;
```

### Onde agir (API e VPS)

| Sinal | Provável causa | O que fazer |
|---|---|---|
| buraco em `api_metrics` e `host_metrics`, `boot_at` igual | o backend caiu ou reiniciou | `journalctl -u concord-server` no horário; `panics` e `heap_mb`/`goroutines` subindo antes = vazamento ou panic |
| buraco nas duas tabelas e `boot_at` novo | a VPS reiniciou | painel do provedor; ver `swap_used_mb`/`mem_used_pct` antes |
| `steal_pct` > 10% por vários minutos | vizinho barulhento na VPS | abrir chamado no provedor ou trocar de plano/host |
| `iowait_pct` alto, `disk_busy_pct` perto de 100% | disco lento (backup, `VACUUM`, uploads) | ver o horário do backup; disco melhor |
| `mem_used_pct` > 90% e swap crescendo | RAM no limite | ver backend/Postgres/LiveKit/Maestro na consulta "quem come a máquina" |
| `disk_used_pct` > 85% ou inodes > 85% | disco enchendo | `du -sh /opt/concord/*`; uploads e backups antigos |
| backup com mais de 26 h | o timer do `pg_dump` não rodou | `systemctl list-timers`, `journalctl -u <backup>` |
| `status_5xx` numa rota | erro do servidor nessa rota | consulta "rotas com mais 5xx"; log do backend no minuto |
| `p95_ms` alto com `db_waits` > 0 | pool do Postgres esgotado | consultas lentas (`pg_stat_statements`), `db_max` |
| `p95_ms` alto sem espera no banco, CPU alta | CPU da VPS | ver quem come a máquina |
| `ws_disconnects` grande num minuto | reinício do backend/Caddy ou rede da VPS | conferir deploy no horário; `net_drops`/`net_errors` |
| `goroutines` ou `heap_mb` só sobem | vazamento no backend | `pprof`; comparar com o último deploy |
| `udp_rcvbuf_errors` subindo com lives pesadas | buffer de UDP do kernel pequeno (ver a nota do LiveKit acima) | `net.core.rmem_max` maior |

## Erros do app

Decisão, alternativas e tetos: [ADR 0068](adr/0068-relatorio-de-erros-do-app.md).
Um erro que antes ficava só no `console.error` do aparelho (ou no journal, no
caso de um panic do backend) vira uma linha agrupada no painel dos devs.

### O que é coletado

| Origem | De onde | O quê |
|---|---|---|
| `renderer` (desktop e web) | `window.onerror`, `unhandledrejection`, a tela "Algo deu errado" (`AppErrorBoundary`) e o erro de rota (`RouteErrorScreen`) | tipo, mensagem, pilha |
| `main` (Electron) | `uncaughtException`, `unhandledRejection`, `render-process-gone`, `child-process-gone`, saída inesperada do `concord-live`, `concord-audio` e do overlay | tipo, mensagem (processo, motivo, código de saída ou sinal), pilha; o renderer manda pela conta dele |
| `mobile` (Android) | `ErrorBoundary`, handler global do React Native (`ErrorUtils`), promessas rejeitadas | tipo, mensagem, pilha |
| `backend` | panic recuperado (`internal/platform/recovery`) | rota (`FullPath`, sem ids), valor do panic, pilha do Go |

Junto de cada erro: versão do app, SO (`Windows`, `Linux`, `Android <API>`…),
desktop/web/android, a tela (o **padrão** da rota: `/servers/:id/channels/:id`),
se estava em call ou em live, e quantas vezes repetiu desde o último envio. Ligado
à conta (como a telemetria); visitante não manda.

**Não vai**: erro de rede esperado (pedido que falhou, offline, `AbortError`,
erro devolvido pela nossa API, arquivo do app que não baixou), o aviso
`ResizeObserver loop` e erro cuja pilha começa numa extensão do navegador. Nunca
vão props, estado nem a pilha de componentes do React.

### O que é limpo (no aparelho e de novo no servidor)

Query string e fragmento das URLs (inclusive relativas, `/api/x?token=…`); tokens (`Bearer …`, JWT, sequências longas de
hex/base64) → `<token>`; e-mail → `<email>`; UUID → `<id>`; caminhos de usuário
(`C:\Users\<nome>`, `/home/<nome>`, `/Users/<nome>`) → `<user>`; texto entre aspas
com mais de 24 caracteres → `"…"`; a URL de cada quadro da pilha fica só com o
caminho dentro do app (`assets/index-abc123.js:1:23456`). Mensagem até 300 bytes,
pilha até 30 linhas e 4 KB.

### Agrupamento, tetos e retenção

- `app_error_groups`: um por erro distinto. A impressão digital (no servidor) é
  `sha256(origem, tipo, mensagem com números → N, 3 primeiros quadros sem linha
  e coluna e sem o hash do arquivo)`. Em JS o quadro é só o nome do arquivo (sem a
  função: o web e o Hermes são minificados e o nome muda a cada build); no Go, a
  função e o arquivo. Por isso erros diferentes no mesmo bundle, com o mesmo tipo e
  a mesma mensagem, caem no mesmo grupo. Guarda a primeira pilha, a primeira e a
  última vez e a primeira versão.
- `app_error_occurrences`: uma linha por (grupo, pessoa, hora, versão), com a
  contagem somada; tela, SO e call/live da última vez naquela hora.
- Aparelho: no máximo 10 erros a cada 30 s, repetição vira contagem, 50 erros
  distintos por sessão do app. Servidor: 6 pedidos/min e 120 erros/h por pessoa,
  1200/h no total; panic do backend gravado a cada 10 s (até 50 distintos).
- 14 dias, apagados pelo backend de hora em hora.

### Pilha traduzida

O build do renderer gera source maps **sem** o comentário `sourceMappingURL` e
sem o código-fonte dentro (`sourcesContent`); os `.map` saem da pasta do app
(não vão no instalador nem no app web) e o deploy os guarda em
`/opt/concord/sourcemaps/` (fora do que o Caddy serve; os de mais de 90 dias são
apagados). O backend traduz a pilha quando um dev abre o grupo
(`SOURCEMAPS_DIR`, padrão `/opt/concord/sourcemaps`). Não é traduzido: o main do
Electron (não é minificado, já se lê), o Android (Hermes; fica crua) e o backend
(o Go já dá arquivo e linha).

### Painel

Aba **Erros** de `/observabilidade` (só `dev_badge_users`): grupos ordenados por
pessoas afetadas e recência, com contagem, pessoas, primeira e última vez,
versões, sistemas e origem; filtros por origem e versão; selo "novo nesta
versão" (todas as ocorrências são da versão mais nova daquela origem). Abrir um
grupo mostra a pilha (traduzida quando dá), as telas e as últimas ocorrências.
O mesmo JSON: `GET /api/obs/errors?days=7&source=&version=` e
`GET /api/obs/errors/<impressão digital>?days=7`.

### Consultas prontas (psql)

**Erros que mais afetam gente (7 dias):**
```sql
SELECT g.source, g.kind, left(g.message, 80) AS mensagem,
       count(DISTINCT o.user_id) AS pessoas, sum(o.count) AS vezes,
       min(o.hour) AS primeira, max(o.last_at) AS ultima,
       string_agg(DISTINCT o.app_version, ', ') AS versoes
FROM app_error_groups g JOIN app_error_occurrences o USING (fingerprint)
WHERE o.hour > now() - interval '7 days'
GROUP BY g.fingerprint ORDER BY pessoas DESC, ultima DESC LIMIT 30;
```

**Erros novos desde ontem:**
```sql
SELECT fingerprint, source, kind, left(message, 80), first_seen, first_version
FROM app_error_groups WHERE first_seen > now() - interval '1 day' ORDER BY first_seen DESC;
```

**Erros por hora (para ver um pico ou um deploy ruim):**
```sql
SELECT o.hour, g.source, sum(o.count) AS vezes, count(DISTINCT o.user_id) AS pessoas
FROM app_error_occurrences o JOIN app_error_groups g USING (fingerprint)
WHERE o.hour > now() - interval '48 hours'
GROUP BY 1, 2 ORDER BY 1, 2;
```

**Um grupo por dentro (telas e versões):**
```sql
SELECT screen, app_version, os, target, in_call, in_live, sum(count) AS vezes
FROM app_error_occurrences WHERE fingerprint = '<impressão digital>'
GROUP BY 1, 2, 3, 4, 5, 6 ORDER BY vezes DESC;
SELECT stack FROM app_error_groups WHERE fingerprint = '<impressão digital>';
```

**Panics do backend por rota:**
```sql
SELECT o.screen AS rota, left(g.message, 80), sum(o.count) AS vezes, max(o.last_at) AS ultima
FROM app_error_groups g JOIN app_error_occurrences o USING (fingerprint)
WHERE g.source = 'backend' AND o.hour > now() - interval '14 days'
GROUP BY 1, 2 ORDER BY vezes DESC;
## O aparelho: o app está lento, travado ou pesado?

Decisão, alternativas e o que ficou de fora: [ADR 0069](adr/0069-metricas-do-aparelho.md).
Responde "o Salinha tá pesado/travou no meu PC" com números, sem olhar nada
fora do app.

### O que é coletado

| Tabela | De quanto em quanto | O quê |
|---|---|---|
| `device_sessions` | uma por abertura do app (renovada a cada envio) | SO, versão, web/desktop, placa de vídeo (renderer do WebGL), núcleos, memória total, **tempo para abrir** (`startup_ms`: do início até a lista de servidores chegar; só quem abriu já logado) e **aceleração por hardware** (`gpu_status`: `enabled`, `software`, `disabled`) |
| `device_samples` | **1 linha por minuto em call ou live, 1 a cada 5 min parado** (fecha antes quando o estado muda); enviadas em lote a cada ~5 min | estado (`parado`, `call`, `transmitindo`), assistindo live, jogo aberto (sim/não, só com a atividade ligada); % do tempo com a janela visível e com foco; **CPU do app** por processo (principal, renderer, GPU, outros; média, % da máquina) e o máximo do app; **memória** do app (média), do renderer e da GPU (máximo); helpers nativos (só Linux); **máquina**: CPU do sistema, memória livre (mínimo), carga (não existe no Windows), bateria, limite de velocidade da CPU do SO; **travadas**: atraso do laço de eventos (p95/máx), quadros longos (quantos, ms somados, o maior), interações lentas (≥ 200 ms) e a pior, memória do JS, janela que parou de responder (`hangs`), GPU que caiu; **rede do app**: RTT do batimento do WebSocket (mediana/máx) e latência da API (p50/p95, quantas) |

Desktop manda tudo; o **app web** manda só o que o navegador dá (travadas,
memória do JS, WebSocket, API, abertura, placa pelo WebGL): os campos do
processo principal e da máquina ficam vazios. Android não manda (ainda).
Visitante sem conta não manda. 14 dias (o backend apaga de hora em hora).

Como ler os números:

- `cpu_*` é **% da máquina inteira** (dividido pelos núcleos): numa máquina de 8
  núcleos, 12,5% = um núcleo cheio.
- O atraso do laço de eventos, os quadros longos e as interações **só contam
  com a janela visível** (escondida, o Chromium espaça os timers e isso não é
  travada); `visible_pct` diz quanto da linha foi medido. Travadas por minuto =
  `long_ms` / minutos visíveis. Atraso acima de 30 s é o aparelho suspenso e é
  descartado.
- "Visível" e "com foco" vêm do estado da janela do app (no desktop o main
  avisa; em call a Page Visibility diz sempre visível): minimizada ou na
  bandeja = escondida; visível sem foco (atrás do jogo) = visível.
- `heap_mb` é o maior heap do JS da linha (lido a cada 2 s com a janela
  visível e no fechamento).
- `seconds` é a duração da linha; `at` é quando ela fechou.

### Painel

Aba **Dispositivos** do `/observabilidade` (só `dev_badge_users`), para 24 h,
3, 7 ou 14 dias. O mesmo JSON: `GET /api/obs/devices?days=7`. As médias são
pesadas pelo tempo (uma linha de 5 min vale cinco de 1 min).

- **Aparelhos mais pesados ou travados**: pessoa, sistema, placa, versão, os
  motivos prováveis em palavras e a linha de números.
- **Consumo típico por estado** (parado, em call, transmitindo): a linha de
  base para saber se um número é alto.
- **Por versão do app**: para ver se uma versão piorou.

| Motivo | Regra (no período) | O que fazer |
|---|---|---|
| A janela parou de responder | `hangs` > 0 | travamento de verdade: ver versão e o que estava aberto; reproduzir com `--perf-log` |
| Travadas longas | ≥ 1 s de quadros longos por minuto visível | perfilar a tela/versão (`--perf-log`); comparar com a linha de base |
| Sem aceleração por hardware | `gpu_status` software/disabled | driver, lista de bloqueio do Chromium, ou a GPU caiu e voltou por software |
| Placa de vídeo caiu | `gpu_crashes` > 0 | driver; cruzar com codec/placa nas lives |
| CPU alta do renderer em call | renderer ≥ 20% da máquina em call/live | o que a tela da call faz (vídeos, animações, DSP de áudio) |
| App pesado (CPU) | app ≥ 25% da máquina na média | ver por processo e por estado |
| Interface atrasada | atraso p95 ≥ 100 ms | idem às travadas |
| Cliques demorando | ≥ 5 interações ≥ 200 ms | qual tela; perfilar |
| Memória do app alta | ≥ 1,5 GB na média | vazamento? `heap_mb` subindo ao longo da sessão |
| Pouca memória livre | < 10% ou < 1 GB livre | a máquina está no limite: o app pesa mais; não é bug |
| Máquina no limite (CPU) | CPU do sistema ≥ 85% | com o app baixo: outra coisa (jogo) ocupa a máquina |
| Rede do app lenta | RTT do WS ≥ 300 ms | rede da pessoa ou VPS (comparar com as métricas do servidor) |
| Abre devagar | abertura ≥ 15 s | regressão de abertura na versão? disco lento? |

### Consultas prontas (psql)

**Quem está mais pesado (média do período, por pessoa e estado):**
```sql
SELECT u.username, x.state, count(*) AS linhas, round(sum(x.seconds) / 60) AS minutos,
       round(avg(x.cpu_browser + x.cpu_renderer + x.cpu_gpu + x.cpu_other)::numeric, 1) AS cpu_app,
       round(avg(x.cpu_renderer)::numeric, 1) AS cpu_renderer, round(avg(x.mem_app_mb)) AS mem_app_mb,
       round(min(x.sys_mem_free_mb)) AS livre_min_mb, s.os, s.gpu, s.app_version
FROM device_samples x JOIN device_sessions s ON s.id = x.session_id JOIN users u ON u.id = s.user_id
WHERE x.at > now() - interval '7 days'
GROUP BY u.username, x.state, s.os, s.gpu, s.app_version ORDER BY cpu_app DESC NULLS LAST LIMIT 30;
```

**Linha de base por estado (p50/p90 do app inteiro):**
```sql
SELECT state, count(*) AS linhas, count(DISTINCT s.user_id) AS pessoas,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY cpu_browser + cpu_renderer + cpu_gpu + cpu_other) AS cpu_p50,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY cpu_browser + cpu_renderer + cpu_gpu + cpu_other) AS cpu_p90,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY mem_app_mb) AS mem_p50,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY mem_app_mb) AS mem_p90
FROM device_samples x JOIN device_sessions s ON s.id = x.session_id
WHERE s.target = 'desktop' GROUP BY state ORDER BY state;
```

**Travadas por pessoa (só o tempo visível conta):**
```sql
SELECT u.username, s.app_version, s.gpu,
       round((sum(x.long_ms) / nullif(sum(x.seconds * x.visible_pct / 100) / 60, 0))::numeric) AS travada_ms_por_min,
       max(x.long_max_ms) AS maior_ms, percentile_cont(0.5) WITHIN GROUP (ORDER BY x.lag_p95_ms) AS atraso_p95,
       sum(x.hangs) AS parou_de_responder, sum(x.slow_inputs) AS cliques_lentos
FROM device_samples x JOIN device_sessions s ON s.id = x.session_id JOIN users u ON u.id = s.user_id
WHERE x.visible_pct > 0 GROUP BY u.username, s.app_version, s.gpu
ORDER BY travada_ms_por_min DESC NULLS LAST LIMIT 30;
```

**Uma versão piorou?** (em call, desktop):
```sql
SELECT s.app_version, count(DISTINCT s.user_id) AS pessoas, count(*) AS linhas,
       round(avg(x.cpu_browser + x.cpu_renderer + x.cpu_gpu + x.cpu_other)::numeric, 1) AS cpu_app,
       round(avg(x.mem_app_mb)) AS mem_mb, percentile_cont(0.5) WITHIN GROUP (ORDER BY x.lag_p95_ms) AS atraso_p95,
       sum(x.hangs) AS parou
FROM device_samples x JOIN device_sessions s ON s.id = x.session_id
WHERE x.state <> 'parado' AND s.target = 'desktop'
GROUP BY s.app_version ORDER BY s.app_version DESC;
```

**Sem aceleração por hardware ou GPU que caiu:**
```sql
SELECT u.username, s.os, s.gpu, s.gpu_status, s.app_version, sum(x.gpu_crashes) AS gpu_caiu
FROM device_sessions s JOIN users u ON u.id = s.user_id LEFT JOIN device_samples x ON x.session_id = s.id
GROUP BY u.username, s.id HAVING s.gpu_status IN ('software', 'disabled') OR sum(x.gpu_crashes) > 0
ORDER BY s.last_seen_at DESC;
```

**Máquina no limite × app pesado** (CPU do sistema alta com o app baixo = outra coisa):
```sql
SELECT u.username, x.state, x.game, round(avg(x.sys_cpu_pct)::numeric) AS cpu_sistema,
       round(avg(x.cpu_browser + x.cpu_renderer + x.cpu_gpu + x.cpu_other)::numeric, 1) AS cpu_app,
       round(min(x.sys_mem_free_mb)) AS livre_min_mb, bool_or(x.on_battery) AS bateria,
       min(x.speed_limit_pct) AS limite_cpu
FROM device_samples x JOIN device_sessions s ON s.id = x.session_id JOIN users u ON u.id = s.user_id
GROUP BY u.username, x.state, x.game HAVING avg(x.sys_cpu_pct) > 70 ORDER BY cpu_sistema DESC;
```

**Tempo para abrir, por versão:**
```sql
SELECT app_version, target, count(*) AS aberturas,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY startup_ms) AS p50_ms,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY startup_ms) AS p90_ms
FROM device_sessions WHERE startup_ms IS NOT NULL GROUP BY 1, 2 ORDER BY 1 DESC;
```

**Rede do app (WS e API), por dia:**
```sql
SELECT date_trunc('day', at) AS dia, percentile_cont(0.5) WITHIN GROUP (ORDER BY ws_rtt_ms) AS ws_rtt,
       percentile_cont(0.9) WITHIN GROUP (ORDER BY ws_rtt_ms) AS ws_rtt_p90,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY api_ms_p50) AS api_p50,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY api_ms_p95) AS api_p95
FROM device_samples GROUP BY 1 ORDER BY 1;
```

**Volume (está dentro do previsto? ~170 linhas por pessoa por dia):**
```sql
SELECT date_trunc('day', at) AS dia, count(*) AS linhas, count(DISTINCT session_id) AS aberturas
FROM device_samples GROUP BY 1 ORDER BY 1;
```
