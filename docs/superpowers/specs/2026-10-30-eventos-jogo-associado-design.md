# Jogo associado ao evento (Fase 2)

Segunda de quatro fases dos eventos do servidor. A Fase 1 (eventos, presença, avisos do bot,
sala própria e permissões por cargo) está no PR #462; esta fase **depende dela**. Spec da Fase 1:
[2026-10-30-eventos-do-servidor-design.md](2026-10-30-eventos-do-servidor-design.md); guia:
[docs/EVENTOS.md](../../EVENTOS.md).

## Objetivo

Quem pode criar ou editar eventos (o dono e os cargos que ele liberou) escolhe, de forma
opcional, um **jogo** para o evento. O jogo aparece no cartão, no detalhe e nas DMs do Salinha
Bot, e, com o evento em andamento, quem confirmou presença e está com aquele jogo aberto ganha o
selo **Jogando** na lista de quem vai.

## Decisões

| Decisão | Escolha | Por quê |
|---|---|---|
| Catálogo de jogos | Os 15 jogos de `shared/gameCatalog.ts` (o da detecção de atividade, com logo e cor) **mais "Outro jogo…"**, com nome livre | Pedido do usuário. Sem tabela nova de jogos; jogo fora do catálogo aparece com o ícone de controle (o `GameIcon` já faz isso). |
| Obrigatoriedade | **Opcional** | Evento de reunião, filme ou conversa não tem jogo. Os eventos que já existem ficam sem jogo, sem migração de dados. |
| O que se guarda | Só o **nome**: `server_events.game_name VARCHAR(64)`, nulo sem jogo | O nome é o que a atividade já traz, e para os 15 do catálogo é exatamente o que a detecção manda. Casar por appid da Steam exigiria busca na Steam no formulário (mais UI e uma dependência de rede); a Fase 3 pode acrescentar o appid sem desfazer nada. |
| Destaque | Selo **Jogando** na lista de quem vai, só visual | Pedido do usuário. Bônus por jogar é a Fase 3. |
| Como o selo casa | Nome da atividade da pessoa × `game_name`, ambos sem espaços nas pontas, sem acento e em minúsculas | A atividade chega em `usePresenceActivityStore.byUser[userId].name`. |
| Quem recebe o selo | Quem **confirmou presença** e tem atividade de jogo igual, **só com o evento em andamento** | O selo diz "está jogando o jogo do evento agora". Respeita quem desliga o compartilhamento de atividade; só detecta no app de computador (Windows). |
| Evento em andamento | O jogo **fica travado**, junto de horário, duração, repetição e avisos | Mantém a regra da Fase 1: em andamento só título, descrição e banner mudam. |
| Validação | Corta espaços; até 64 caracteres; sem caractere de controle; vazio vira "sem jogo". Erro: `invalid_game` (400) | Entrada do usuário que vai para DM e para a tela. |

## Arquitetura

### Backend (`backend/internal/event/`)
- Migration `000179_event_game.up.sql`/`.down.sql`: `ALTER TABLE server_events ADD COLUMN game_name VARCHAR(64)`.
- `model.go`: `Event.GameName *string` (`game_name`), `Input.GameName string`, `ErrInvalidGame`.
- `validate.go`: `cleanGame` (parte de `cleanText`, que a edição simples também usa para não aceitar jogo inválido).
- `service.go`: `apply` grava o jogo; `sameSchedule` passa a comparar o jogo (mudar o jogo com o evento em andamento volta `event_running`).
- `repository.go`: `game_name` no `eventSelect`, no `Create` e no `Update` (não entra no `UpdateBasics`).
- `texts.go` e `scheduler.go`: `DueReminder.Game`, lido no `ClaimDue`; o texto da DM só ganha o trecho do jogo quando há jogo.
- `handler.go`: `invalid_game` na tabela de erros.

### App (`frontend/src/renderer/src/features/events/`)
- `api/events.ts`: `game_name: string | null` em `ServerEvent`; `game_name: string` em `EventInput`.
- `lib/eventGame.ts` (puro): opções do seletor a partir de `GAMES` (nome, valor), `gameChoiceOf(name)` (qual opção representa o nome salvo, ou "Outro jogo…"), `normalizeGame(name)` e `isPlayingGame(activityName, eventGame)` (o casamento do selo).
- `lib/eventForm.ts`: `gameName` e `customGame` nos valores do formulário; `toInput` manda `game_name` limpo; `formFromEvent` abre o seletor no jogo certo.
- `components/GameField.tsx`: seletor (Nenhum jogo, os 15 do catálogo, Outro jogo…) e o campo de texto do "Outro jogo…"; `disabled` com o evento em andamento.
- `components/EventGame.tsx`: o logo (`GameIcon`) e o nome, usado no cartão e no detalhe; some sem jogo.
- `components/GoingList.tsx`: o selo **Jogando**; busca a atividade só de quem confirmou (`fetchPresenceFor`) e só com o evento em andamento.
- `EventListItem.tsx`, `EventDetail.tsx`, `EventForm.tsx`: usam os componentes acima.

## Textos (DM do Salinha Bot)
**Aprovados em 2026-10-30.** O trecho do jogo só aparece quando o evento tem jogo:

- Antecedência: `🔔 O evento "{título}" começa em {N}, no servidor {servidor}. Jogo: {jogo}. A sala abre na hora de começar.`
- Começou: `📅 O evento "{título}" está começando agora. Jogo: {jogo}. Entre na sala #{canal}, no servidor {servidor}.`
- Começou, se a sala não abriu (variante que a Fase 1 já tem; só ganha o trecho do jogo no fim; aprovada também em 2026-10-30): `📅 O evento "{título}" está começando agora, no servidor {servidor}. Jogo: {jogo}.`

Rótulos da UI (aprovados): "Jogo (opcional)", "Nenhum jogo", "Outro jogo…", "Nome do jogo" e o selo "Jogando".

## Responsivo (360 / 768 / 1280 px)
- Formulário: o seletor e o campo de texto ocupam a largura toda; alvos de toque ≥ 44 px.
- Cartão e detalhe: o nome do jogo quebra ou trunca (`min-w-0`); o logo não encolhe.
- Selo "Jogando": quebra de linha junto do nome, sem rolagem horizontal.

## Testes
- Go: validação do jogo (vazio, 64 caracteres, 65, controle, espaços); criar e editar com e sem jogo; jogo travado com o evento em andamento (`event_running`); texto da DM com e sem jogo; repositório e `ClaimDue` contra o Postgres de teste.
- Frontend (Vitest): `eventGame.ts` (opções, escolha do seletor, normalização, casamento do selo), formulário (seletor, "Outro jogo…", edição de jogo fora do catálogo, travado em andamento), cartão e detalhe com e sem jogo, selo só para quem confirmou e está jogando e só em andamento.
- CRAP ≤ 15 em tudo que for tocado.

## Fora de escopo
Casar por appid da Steam, filtrar eventos por jogo, objetivos e XP (Fase 3), usar o jogo no nome dos canais da sala, evento global (Fase 4) e app mobile.

## Verificação de ponta a ponta
1. Criar um evento escolhendo um jogo do catálogo: o cartão e o detalhe mostram o logo e o nome; a DM de antecedência e a do começo trazem "Jogo: …".
2. Criar outro com "Outro jogo…" e um nome livre: aparece com o ícone de controle; editar volta com o seletor em "Outro jogo…" já preenchido.
3. Criar um evento sem jogo: nada de jogo no cartão, no detalhe nem na DM.
4. Com o evento em andamento, o campo do jogo fica travado (título, descrição e banner continuam editáveis); tentar mudar pelo servidor volta `event_running`.
5. Com duas contas confirmadas e uma delas com o jogo do evento aberto (ou simulando a atividade), só ela mostra o selo "Jogando"; sem o evento em andamento, ninguém mostra.
6. 360 / 768 / 1280 px: formulário, cartão e detalhe sem rolagem horizontal.
7. `node scripts/affected-tests.mjs pr` verde.

## Ordem de entrega
A fase 1 (#462) já entrou na `develop`; esta fase parte dela e o PR vai direto para a `develop`.
