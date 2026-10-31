# Eventos do servidor

Quem o dono do servidor liberou (por cargo) marca um evento no servidor (banner, título,
descrição, horário, duração e repetição). Os membros respondem **Vou** ou
**Não vou**, e quem foi de **Vou** recebe, na DM, avisos do Salinha Bot antes e
na hora de começar. Spec:
[2026-10-30-eventos-do-servidor-design.md](superpowers/specs/2026-10-30-eventos-do-servidor-design.md).

## Regras

- **Quem mexe nos eventos** é uma **configuração do servidor**, vale para todos os eventos: o
  **dono** escolhe, cargo a cargo, o que cada um pode (**criar**, **editar**, **excluir**). O dono
  sempre pode tudo; cargo sem nada marcado não pode nada; o Administrador não ganha isto só por
  ser Administrador. A quarta chave, **configurar**, deixa o cargo abrir a seção *Eventos* das
  configurações do servidor e escolher criar, editar e excluir dos cargos; só o dono liga ou
  desliga o *configurar*. Tabela `event_role_actions` (`actions`: 1 criar, 2 editar, 4 excluir,
  8 configurar). Ver e responder só exige ser membro. Não usa as permissões de cargo (o bit 14
  continua livre).
- **Sala própria**: o evento não usa um canal que já existe. Na hora do início o
  agendador cria um canal de voz e um de texto (`evento-<título>` e
  `evento-<título>-chat`), **privados**: o @everyone não vê; veem só quem respondeu
  **Vou** e o organizador (dono e Administrador veem tudo, como em qualquer canal
  privado). Quem confirma depois entra na hora; quem desiste sai (o organizador nunca
  sai). No fim da **duração** (30 min a 4 h, padrão 2 h) a chamada é derrubada
  (`call.CloseChannelCall`) e os dois canais são apagados, com o histórico do chat.
  Em evento recorrente, cada ocorrência abre e apaga a sua. Com o evento em andamento só dá para mudar **título, descrição e banner**
  (`event_running` para o resto); cancelar fecha a sala na hora. Os canais são
  **gerenciados** (`channels.managed`): ninguém os renomeia, apaga, muda permissões nem os
  escolhe como canal principal; só o evento os apaga. Código: `event/rooms.go`.
- **Repetição**: não repete, todo dia, toda semana ou todo mês, com fim opcional
  (data ou número de vezes). O mês sem o dia (ex.: 31) usa o último dia. Só a
  regra fica guardada; `next_start_at` é a ocorrência atual e `occurrences_done`
  o índice dela (`event/recurrence.go`).
- **Presença**: vale só para a ocorrência atual. Quando ela acaba, a próxima
  começa sem respostas.
- **Avisos**: até **2 antecedências** da lista (1 dia, 1 h, 30, 15, 10 e 5 min;
  padrão 10 e 5) e **sempre** o aviso na hora de começar.
- **Jogo** (opcional): o evento pode ter um jogo, escolhido da lista de jogos conhecidos do app
  ou digitado em "Outro jogo…" (até 64 caracteres, sem caractere de controle). Fica na coluna
  `server_events.game_name` (nula = sem jogo) e é só texto: não liga a appid, filtro nem XP.
  Aparece no cartão, no detalhe e nas DMs do bot (`Jogo: X.`). Com o evento em andamento o jogo
  não muda (`event_running`, como o horário). No detalhe, quem confirmou e está jogando esse
  jogo agora ganha o selo "Jogando" (compara o nome sem acento nem maiúsculas com a atividade
  de presença; só durante a ocorrência). Código: `event/validate.go`, `frontend/.../events/lib/eventGame.ts`.
- **Banner**: PNG, JPEG ou WEBP de até 10 MB, em `uploads/event-media/<id>`
  (fora da limpeza dos anexos do chat). O evento guarda só o `banner_id`; o app
  monta a URL com o token de mídia (`GET /event-banners/:bannerId?token=`).
  **Banner trocado, tirado ou de evento cancelado é apagado na hora**; uma faxina por hora
  (`event/banner_janitor.go`) apaga o que nenhum evento vivo usa e tem mais de 24 h.

## Como os avisos saem

1. Ao criar ou editar, o service grava as linhas de `event_reminders`
   (`due_at` = início − antecedência; o "na hora" é `offset_minutes = 0`).
   Antecedência que já passou (evento criado em cima da hora) nem é gravada.
2. O ticker (`event/scheduler.go`, a cada ~30 s) reivindica os avisos vencidos
   num `UPDATE … RETURNING` com `FOR UPDATE SKIP LOCKED`: cada aviso sai uma vez,
   mesmo com mais de uma instância. Depois manda a DM do Salinha Bot a quem
   disse Vou. Falha com uma pessoa não barra as outras.
3. Aviso de antecedência atrasado mais de 10 min (o servidor ficou fora do ar) é
   descartado; o "começou" ainda sai até 1 h depois do início.
4. Cada rodada do ticker faz, nesta ordem: fecha as salas que acabaram (ou de evento
   cancelado), abre as que chegaram na hora, manda os avisos devidos (o "começou" já
   encontra a sala aberta) e avança as ocorrências que acabaram e já fecharam a sala
   (início + duração); sem próxima, o evento é encerrado. Abrir ou fechar uma sala
   emite `event:update` para o app recarregar.

Os textos das DMs estão em `event/texts.go`.

## API

| Rota | Quem |
|---|---|
| `GET /servers/:id/events` | membro (próximas ocorrências, contagem de "vou", minha resposta) |
| `GET /servers/:id/events/access` | membro (o que posso: criar, editar, excluir, configurar) |
| `GET /servers/:id/events/roles` | dono e quem tem *configurar* (cargos e o que cada um pode) |
| `PUT /servers/:id/events/roles/:roleId` | dono e quem tem *configurar* (`{create, edit, delete, configure}`; o `configure` só vale do dono) |
| `POST /servers/:id/events` | criar |
| `PATCH /servers/:id/events/:eventId` | editar |
| `DELETE /servers/:id/events/:eventId` | excluir |
| `POST /servers/:id/events/banner` | criar ou editar (multipart, devolve `banner_id`) |
| `PUT` / `DELETE …/events/:eventId/rsvp` | membro (`{"going": true\|false}` no PUT) |
| `GET …/events/:eventId/rsvps` | membro (quem vai) |
| `GET /event-banners/:bannerId?token=` | membro do servidor do evento |

Erros vêm com `code`: `missing_permission`, `not_member`, `event_not_found`,
`event_ended`, `event_in_past`, `invalid_title`, `invalid_description`,
`invalid_recurrence`, `invalid_reminder`, `too_many_reminders`,
`invalid_duration`, `event_running`, `role_not_found`, `invalid_banner`, `invalid_game`.

O evento (`Event`) e o corpo de criar/editar (`Input`) levam `game_name` (texto; vazio ou
nulo = sem jogo).

## Tempo real

`event:create`, `event:update` (também quando a sala abre ou fecha), `event:delete`, `event:rsvp` e `event:access` (o dono mudou a configuração por cargo) na sala `server:<id>`.
`delete` leva `{server_id, event_id}`; `rsvp` leva `{server_id, event_id,
going_count}` (quantos vão agora na ocorrência atual, sem dizer quem).

## Fora de escopo (por enquanto)

Objetivos e XP na call (fase 3; o bônus só vale para quem confirmou presença), evento global
aberto a todo o Salinha (fase 4), resposta "talvez" e app mobile.
