# Modo lento por canal (issue #586)

## Objetivo

Quem gerencia o canal define um intervalo mínimo entre as mensagens de cada membro
naquele canal (o "slowmode" do Discord). Quem tem permissão fica isento.

## Decisões (com o porquê)

- **Isentos**: quem tem *Gerenciar mensagens* **ou** *Gerenciar canais* no canal (o dono e
  o Administrador têm tudo). Igual ao Discord e sem permissão nova: os bits de permissão
  acabaram (`1<<31` é o último, ADR 0054).
- **Intervalos**: a lista do Discord, num seletor: desligado, 5 s, 10 s, 15 s, 30 s, 1 min,
  2 min, 5 min, 10 min, 15 min, 30 min, 1 h, 2 h, 6 h. O backend só aceita esses valores.
- **Onde se configura**: no modal *Editar canal* (exige *Gerenciar canais*, como renomear).
  Canais de sistema não se editam, então não têm modo lento.
- **Onde vale**: canal de texto e chat do canal de voz. DMs e grupos ficam de fora.
- **O que conta**: toda mensagem nova no canal (texto, anexo, áudio, figurinha, GIF e `/tts`).
  Editar, reagir e comandos que não viram mensagem (ex.: Maestro) não contam.
- **Onde fica a vez de cada um**: em memória no backend, como o cooldown do `/tts` e o
  anti-spam do `@all` (`message/tts.go`, `mention_limiter`). Padrões comparados: (a) mapa em
  memória por canal+pessoa (o que o repo já faz; um processo só); (b) consultar a última
  mensagem da pessoa no banco (sobrevive a reinício, mas apagar a mensagem zera a vez e cada
  envio ganha uma consulta); (c) Redis (dependência nova). Escolhido (a): é o padrão do repo
  e reiniciar o backend só libera uma mensagem a mais. Sem ADR (não foge do padrão).
- **Mobile**: só o aviso de erro ao bater no limite; contagem regressiva fica para outra issue.

## Arquitetura

Backend:
- `backend/migrations/000204_channels_slowmode.{up,down}.sql`: coluna
  `channels.slowmode_seconds INT NOT NULL DEFAULT 0` com CHECK 0..21600.
- `internal/channel/slowmode.go`: valores aceitos (`ValidSlowmode`) e `ErrInvalidSlowmode`.
  `Channel.SlowmodeSeconds` (`slowmode_seconds` no JSON). `PUT /servers/:id/channels/:channelId`
  aceita `slowmode_seconds` opcional; a troca entra no registro de auditoria e sai no
  `channel:update`. `Repository.SlowmodeSeconds(ctx, channelID)` para o `message`.
- `internal/message/slowmode.go`: `Slowmode` (portão compartilhado entre mensagens comuns e
  `/tts`): lê o intervalo do canal, isenta por permissão, marca a vez (Take) e devolve a vez
  se a mensagem não sair (Release). Erro `*SlowmodeError{RetryAfter}` → HTTP 429
  `{"code":"slowmode","retry_after":<s>}`.

Desktop/web:
- `features/chat/lib/slowmode.ts`: opções, rótulos, textos e contas (puro).
- `features/chat/store/slowmodeStore.ts`: até quando cada canal está bloqueado para mim.
- `features/chat/hooks/useSlowmode.ts` + `components/composer/SlowmodeBar.tsx`: faixa acima
  do campo e bloqueio do envio durante a espera.
- `ChannelFormModal`: seletor "Modo lento" ao editar. `serverStore.updateChannel` sai do
  god store (o formulário chama a API e recarrega os canais).

Mobile: `SendOutcome` ganha `{ slowmode: segundos }` e o `Composer` mostra o aviso.

## Textos aprovados

- Modal Editar canal — rótulo: "Modo lento"; ajuda: "Cada membro só pode mandar uma mensagem
  a cada intervalo. Quem tem Gerenciar mensagens ou Gerenciar canais fica isento."
- Opções: Desligado, 5 s, 10 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 15 min, 30 min, 1 h, 2 h, 6 h
- Faixa acima do campo (ícone de relógio): "Modo lento: 1 mensagem a cada 30 s"; esperando:
  "Modo lento: aguarde 0:12"; isento: "Modo lento ativado (você está isento)"
- Erro ao bater no limite (desktop e mobile): "Modo lento: aguarde 12 s para mandar outra mensagem."

## Responsivo

A faixa é uma linha de texto pequena acima do campo, com `truncate`; em 360 px cabe
("Modo lento: 1 mensagem a cada 30 min"). O seletor do modal ocupa a largura toda.

## Fora de escopo

- Permissão dedicada "Ignorar modo lento".
- Contagem regressiva no mobile; configurar ao criar o canal.
- Persistir a vez de cada um entre reinícios do backend.

## Verificação de ponta a ponta

1. Editar um canal → Modo lento 10 s → salvar; outro membro (sem cargo) vê a faixa.
2. Ele manda uma mensagem: a faixa conta "aguarde 0:10" e o envio fica bloqueado; tentar pela
   API antes do prazo dá 429 `slowmode`.
3. Quem tem Gerenciar mensagens manda várias seguidas e vê "(você está isento)".
4. No chat do canal de voz vale igual; em DM não aparece nada.
5. No mobile, enviar duas seguidas mostra "Modo lento: aguarde N s para mandar outra mensagem."
