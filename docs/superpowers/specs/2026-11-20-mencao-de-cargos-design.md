# Menção de cargos e `@everyone` no chat dos canais

- Data: 2026-11-20
- Branch: `feat/mencao-de-cargos` (de `origin/develop`)
- ADR: [0065](../../adr/0065-mencao-de-cargo-pelo-nome.md)
- Depende de: a base compartilhada da lista de sugestões (`shared/ui/SuggestionList`, branch
  `feat/navegacao-teclado-sugestoes`) já estar na `develop`.

## Objetivo

1. **Mencionar um cargo:** `@nome-do-cargo` num canal de servidor avisa quem tem aquele cargo.
2. **`@everyone`:** outra forma de escrever `@all`, para quem vem do Discord.

`@all` e `@here` já existem e não mudam de comportamento.

Sucesso: quem decide se o cargo pinga é o servidor; o autor vê na lista do `@` e no chip da
mensagem se marcou um cargo ou uma pessoa, mesmo quando os dois têm o mesmo nome; quem tem o cargo
recebe destaque, selo de menção, aviso e push; cada pessoa consegue ignorar menções de cargo por
servidor.

## Escopo

- Canais de texto e chat do canal de voz de um servidor. Em DM e grupo `@cargo` é texto puro.
- Backend, desktop (Electron) e app web: tudo.
- Android: recebe (push e aviso com o app aberto) e mostra o texto como veio. **Não menciona
  cargo**, porque ainda não tem a lista do `@`.
- Um PR só.

## Decisões (com o porquê)

| # | Decisão | Por quê |
|---|---|---|
| D1 | O texto da mensagem guarda `@handle`, texto simples. O handle vem do nome do cargo (regra em "Handle"). | Decidido pelo usuário. O texto fica legível em push, busca, resposta, TTS e no Android sem tradução. |
| D2 | O app manda junto os ids dos cargos mencionados (`mention_role_ids`). O servidor valida e grava; nunca adivinha pelo nome. | Com texto simples, cargo e pessoa de mesmo nome viram o mesmo `@suporte`: só a escolha de quem escreveu desfaz a dúvida. Decidido pelo usuário. |
| D3 | A mensagem guarda o id **e** o handle usado (`mention_roles`). | O chip e o destaque continuam certos depois de renomear o cargo, e quem lê sabe que aquele `@suporte` é cargo sem conhecer os cargos do servidor. *Decisão do agente.* |
| D4 | Pode mencionar o cargo quem tem *Mencionar @all, @here e cargos* no canal, ou qualquer pessoa se o cargo estiver com "qualquer pessoa pode mencionar" ligado (desligado por padrão). | Decidido pelo usuário. Não há bit de permissão livre (ADR 0054). |
| D5 | Uma janela de anti-spam só (30 s por autor, por canal) para `@all`, `@here` e cargos. | Já existe; uma mensagem com `@all` e um cargo gasta uma vez só. *Decisão do agente.* |
| D6 | Id inválido ou sem permissão é ignorado: a mensagem sai, só não pinga. | É como o `@all` sem permissão se comporta hoje. |
| D7 | Conflito de nome (handle do cargo igual ao nick de um membro): vale o que foi escolhido na lista, enquanto o `@handle` estiver no texto (a escolha fica guardada por sala, como o rascunho: vale se o envio falhar ou a pessoa sair e voltar). Escrito à mão, sem escolher, vale a pessoa. | Decidido pelo usuário. Deixar de avisar um cargo é menos grave que avisar um cargo inteiro por engano. |
| D8 | Cargo escolhido com handle igual a um nick: só o cargo é avisado; o membro com aquele nick não recebe menção pessoal por esse texto. | Consequência de D7: um `@handle` tem um significado só por mensagem. |
| D9 | Dois cargos com o mesmo handle: vale o escolhido na lista; sem escolha, o de posição mais alta. | Nome de cargo não é único no banco. *Decisão do agente.* |
| D10 | O `@everyone` (cargo padrão) e o cargo Bots não são mencionáveis como cargo. Cargo cujo nome não gera handle (só símbolos ou emoji) ou gera `all`, `here` ou `everyone` não aparece na lista. | Para todos já existe `@all`; bot não recebe aviso; um cargo não toma o lugar do `@all`. |
| D11 | Editar nunca pinga: a edição só pode **tirar** um cargo de `mention_roles` (quando o `@handle` some do texto). Encaminhada não pinga. | Mesma regra do `@all` hoje. |
| D12 | "Ignorar menções de cargo" é uma preferência nova, por servidor, separada do "Ignora @all e @here". | Decidido pelo usuário. |
| D13 | `@everyone` é tratado como `@all` e gravado como `mention_everyone = 'all'`. Na lista do `@` ele só aparece quando o que foi digitado começa com "e". | Sem mudança de banco; com só "@" a lista não ganha um terceiro item quase igual. *Decisão do agente.* |
| D14 | Sem linha de aviso acima do campo enquanto se escreve. A diferença aparece na lista e no chip. | Decidido pelo usuário. |
| D15 | O app guarda "meus cargos por servidor" num store próprio, alimentado por uma rota nova. | Hoje o app só conhece os cargos do servidor aberto, e o selo de menção na barra de servidores precisa valer para os outros. *Decisão do agente.* |
| D16 | O chip do cargo não abre nada ao clicar. | Fora do pedido; abrir a lista de membros do cargo fica para depois. |

## Handle

Regra única, igual no Go e no TypeScript:

1. minúsculas;
2. tira espaços das pontas; cada sequência de espaços vira `-`;
3. remove tudo que não é letra (`\p{L}`), dígito decimal (`\p{Nd}`), `_` ou `-`;
4. junta `-` repetidos e tira `-` das pontas;
5. vazio = o cargo não tem handle.

"Minúsculas" é a mesma conta nos dois lados: o sigma final do grego (`ς`) vira `σ`, porque o JavaScript
escolhe entre os dois pela posição e o Go não.

| Nome do cargo | Handle |
|---|---|
| `Suporte` | `suporte` |
| `Equipe de Suporte` | `equipe-de-suporte` |
| `Moderação` | `moderação` |
| `VIP ⭐` | `vip` |
| `🔥🔥` | (sem handle) |

O `@handle` vale como menção com a regra de token que já existe: o `@` abre a palavra, o handle
acaba em fim de texto, espaço ou pontuação de fechamento, e nada dentro de código conta. Como `-`
e letra continuam a palavra, `@equipe-de-suporte` nunca casa com o cargo `equipe`.

Os casos (handles e onde o `@handle` vale no texto) ficam em
`backend/internal/message/testdata/role_mentions.json` e rodam nos dois lados,
como o `permission/testdata/vectors.json`.

## Arquitetura

Segue os padrões do repo (domínio → repository → service → handler; `mention_everyone` decidido
pelo servidor). O único ponto novo é o formato da menção, registrado no ADR 0065.

### Banco: migration `000208_role_mentions`

```sql
ALTER TABLE roles ADD COLUMN mentionable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE messages ADD COLUMN mention_roles JSONB;  -- [{"id": "<uuid>", "handle": "suporte"}]; NULL = não pinga cargo
ALTER TABLE server_notification_settings ADD COLUMN suppress_roles BOOLEAN NOT NULL DEFAULT FALSE;
```

### API

| Rota | Mudança |
|---|---|
| `POST /channels/:id/messages` | aceita `mention_role_ids: string[]` (opcional) |
| `POST /conversations/:id/messages` | não muda; o campo é ignorado |
| mensagem (REST e `message:create`/`message:update`) | campo `mention_roles: [{id, handle}]` ou `null` |
| `PATCH /servers/:id/roles/:roleId` | aceita `mentionable`; recusado no `@everyone` e no Bots, como o `hoist` |
| cargo (REST e `role:create`/`role:update`) | campo `mentionable` |
| preferências de notificação do servidor | campo `suppress_roles` |
| `GET /users/me/server-roles` (nova) | `{ "<server_id>": ["<role_id>", ...] }`, só os servidores em que a pessoa tem cargo |

Nenhum evento novo de WebSocket: `server:member:roles` já leva `user_id` e `role_ids`.

### Backend

`internal/message`
- `mention_role.go` (novo): `RoleHandle(name)`, a validação dos ids recebidos (cargo do servidor,
  não fixo, handle presente no texto como token, autor pode) e `editedMentionRoles`.
- `mention.go`: `@everyone` entra em `everyoneMentions` como `all`; a decisão de `@all`/`@here` e
  a dos cargos passam por **uma** chamada ao anti-spam (D5).
- `create_handler.go`, `create.go`, `insert.go`, `message_scan.go`, `edit.go`, `model.go`: o campo
  novo, da requisição ao banco e de volta.
- Porta nova `RoleSource` (cargos do servidor pelo id), atendida pelo serviço de permissões, que
  já tem os cargos no snapshot em cache. Ligação em `cmd/wire_chat.go`.

`internal/permission` e `internal/role`
- `Role.Mentionable`, as duas listas de colunas, `role.Input.Mentionable`, a regra dos cargos
  fixos. A edição já entra no registro de auditoria pelo `recordRole`.
- `role`: consulta e rota de "meus cargos por servidor".

`internal/push`
- `mention_targets.go` (novo, commit estrutural antes): sai do `notifier.go` o cálculo de quem
  recebe (`mentionTargets`, `mergeTargets`, `allowed`).
- Alvos passam a ter três tipos, nesta ordem de força: pessoal, cargo, `@all`. `suppress_roles`
  corta quem só foi alcançado pelo cargo. Nick igual ao handle de um cargo pingado não conta
  como menção pessoal (D8).
- `Directory.RoleMemberIDs(serverID, roleIDs)`.

`internal/notifysettings`
- `SuppressRoles`: modelo, as duas consultas e a regra de que só vale por servidor.

### Desktop e web (`frontend/src/renderer/src`)

`features/chat`
- `lib/roleMentions.ts` (novo): `roleHandle`, as sugestões de cargo, os ids a enviar (escolhas da
  lista + digitados à mão, com D7 e D9) e a quebra do texto em pedaços de cargo a partir de
  `mention_roles`. Fica fora de `lib/mentions.ts`, que já tem 301 linhas.
- `lib/mentions.ts`: `@everyone` como `all`; `mentionQuery` aceita letra acentuada e `-`;
  `messageMentionsMe` e `textMentionsUser` passam a olhar `mention_roles`.
- `hooks/useMentionMenu.ts`: guarda, por sala, os cargos escolhidos na lista (`useRoomState`).
  Escolher uma pessoa com o mesmo handle desfaz a escolha do cargo.
- `hooks/useComposerSend.ts` e `api/messages.ts`: enviam `mention_role_ids`.
- `components/MentionSuggestionList.tsx`: linha do cargo (ver "Aparência").
- `components/RoleMentionChip.tsx` (novo) e o desenho das partes da mensagem.

`features/servers`
- `store/myRolesStore.ts` (novo): meus cargos por servidor. Carrega no login e na reconexão do
  WebSocket; atualiza com `server:member:roles` (quando sou eu) e `server:removed`. Nada entra
  no `serverStore`.
- `components/RolesSection.tsx`: a chave "qualquer pessoa pode mencionar".
- `lib/permissionCatalog.ts`: nome e descrição novos da permissão.

`features/notifications`
- `lib/notificationMute.ts`: `MentionKind.role` e `suppressRoles` na decisão.
- `lib/notifications.ts`: título do aviso de menção de cargo.
- `components/NotifySettingsModal.tsx` e `MutedNotifications.tsx`: a chave e o resumo.

### Android (`mobile/src`)

- `features/notifications/lib/inAppNotification.ts`: passa a usar `mention_everyone` (hoje lê
  `@all` do texto, mesmo quando o servidor não liberou) e `mention_roles` com os meus cargos.
- `features/servers/store/myRolesStore.ts` (novo) com a mesma rota.

### Aparência

| Onde | Pessoa (como hoje) | Cargo |
|---|---|---|
| Lista do `@` | nome e `@nick` | bolinha na cor do cargo, nome na cor do cargo (`roleColorCss`), etiqueta "Cargo" |
| Mensagem | chip atual, abre o perfil | chip na cor do cargo, com o nome atual do cargo; não abre nada |

- Ordem na lista: `@all`/`@here`/`@everyone`, pessoas, cargos. O item padrão do Tab/Enter
  continua sendo uma pessoa quando há alguma.
- Só aparecem os cargos que a pessoa pode mencionar (D4) e que têm handle (D10). A busca casa
  pelo nome do cargo sem diferenciar acento.
- Cargo apagado, ou de um servidor cujos cargos o app não conhece: o chip mostra o texto como
  foi escrito, em estilo neutro.

### Fluxo

1. A pessoa digita `@sup`, a lista mostra a pessoa `suporte` e o cargo Suporte. Ela escolhe o
   cargo: o campo recebe `@suporte ` e a escolha fica guardada na sala.
2. Ao enviar, o app junta os ids: escolhas cujo handle ainda está no texto, mais os handles
   escritos à mão que batem com um cargo mencionável e não com o nick de um membro.
3. O servidor valida cada id (D4, D6, D10), passa pelo anti-spam (D5), grava `mention_roles` e
   publica o `message:create`.
4. Cada app cruza `mention_roles` com os próprios cargos naquele servidor: destaque da linha,
   selo de menção, aviso e som, respeitando silenciar, nível e "Ignorar menções de cargo".
5. O push vai para quem tem o cargo, vê o canal, está sem o app do celular aberto e não ignorou.

### Erros

- Anti-spam estourado, sem permissão, cargo inexistente ou handle fora do texto: a mensagem sai
  sem `mention_roles` (D6). Nada de erro para o autor.
- Falha ao ler os cargos do servidor: registra no log e a mensagem sai sem pingar cargo.
- Falha ao gravar a mensagem: a vez do anti-spam é devolvida, como já acontece.
- Rota de "meus cargos" fora do ar: o app segue sem selo de menção de cargo nos servidores
  fechados; no servidor aberto usa os cargos que já tem.

### Responsivo

- Lista do `@` em 360 px: o nome do cargo trunca com reticências e a etiqueta "Cargo" não
  encolhe. Toque e teclado funcionam como para as pessoas (mesma `SuggestionList`).
- As duas chaves novas usam o componente de chave que os modais já usam; conferir em 360, 768 e
  1280 px.

## Textos

Aprovado:

| Onde | Texto |
|---|---|
| Etiqueta do cargo na lista do `@` | Cargo |

Propostos, **aguardando aprovação**:

| Onde | Texto |
|---|---|
| Nome da permissão | Mencionar @all, @here e cargos |
| Descrição da permissão | Avisar todo mundo do canal de uma vez e mencionar qualquer cargo. |
| Chave no editor de cargo | Permitir que qualquer pessoa mencione este cargo |
| Chave nas notificações do servidor | Ignorar menções de cargo |
| Resumo em "Notificações silenciadas" | Ignora menções de cargo |
| Título do aviso no desktop | `{autor} mencionou @{handle do cargo}` (o handle vem na mensagem; o nome o app só conhece no servidor aberto) |
| Registro de auditoria (campo do cargo) | Qualquer pessoa pode mencionar |
| Novidade no changelog | Dá para mencionar um cargo no chat com @nome-do-cargo, e @everyone vale como @all. |

Reaproveitado, sem texto novo: `@everyone` na lista usa "Notifica todos do canal", o mesmo do `@all`.

## Fora de escopo

- Mencionar cargo a partir do Android (precisa da lista do `@` lá).
- Preferências de notificação no aviso do Android com o app aberto: ele ainda não lê silenciar, nível nem
  "ignorar" (já era assim para `@usuário` e `@all`). O push, com o app fechado, respeita.
- Chip clicável, com os membros do cargo.
- "Só quem está online" de um cargo.
- Menções em comentários de propostas (`features/proposals`), que têm fluxo próprio.
- Mudar `@all` e `@here`.
- Contagem de menções guardada no servidor (o selo continua sendo do app, como hoje).

## Testes

- Go: casos do handle e do token (JSON compartilhado); validação dos ids (permissão, chave do cargo, cargo
  fixo, handle fora do texto, dentro de código, anti-spam compartilhado); edição só tira;
  `@everyone` vira `all`; alvos do push (ordem de força, D8, `suppress_roles`); `mentionable`
  recusado nos cargos fixos.
- Vitest: casos do handle (mesmo JSON); ids a enviar com e sem escolha, com conflito de nick e
  de cargo; sugestões (ordem, item padrão, só mencionáveis); quebra do texto em chips;
  `muteDecision` com `role`; `myRolesStore`.
- Jest (mobile): aviso com o app aberto para `mention_everyone` e `mention_roles`.

## Verificação de ponta a ponta

Com dois usuários, A (com a permissão) e B (sem), num servidor com o cargo "Equipe de Suporte"
dado a B:

1. A digita `@equ`, escolhe o cargo e envia. B vê a linha destacada, o chip na cor do cargo, o
   selo de menção no canal e recebe o aviso. Com B em outro servidor, o selo aparece na barra
   de servidores.
2. B tenta mencionar o mesmo cargo: ele não aparece na lista, e o texto escrito à mão sai sem
   chip. A liga a chave no cargo; B passa a conseguir.
3. A renomeia o cargo: a mensagem do passo 1 continua com chip e destaque, com o nome novo.
4. Um membro com o nick `suporte` e um cargo "Suporte": a lista mostra os dois, diferentes. A
   escolhe o cargo: só quem tem o cargo é avisado. A escolhe a pessoa: só ela.
5. B liga "Ignorar menções de cargo": a menção de cargo não avisa nem soma no selo; uma menção
   pessoal continua avisando.
6. A edita uma mensagem antiga e acrescenta `@equipe-de-suporte`: ninguém é avisado.
7. A manda `@everyone`: comporta-se como `@all`.
8. B com o app do celular fechado recebe o push do passo 1; com o app aberto, o aviso dentro do app.
9. `node scripts/affected-tests.mjs pr` verde.
