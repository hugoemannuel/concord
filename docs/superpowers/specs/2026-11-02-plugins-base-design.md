# Plugins da comunidade, parte 1: base (ficha, instalação, escolha do membro e painel)

- Data: 2026-11-02
- Origem: issue #480 (placar ao vivo de Atlético-MG e Cruzeiro), ampliada para um
  sistema de plugins.
- ADR: [0056. Plugins em iframe isolado](../../adr/0056-plugins-em-iframe-isolado.md)

## Objetivo

Deixar quem programa criar plugins para a Salinha, sem que a Salinha rode o código
de ninguém. O plugin é a página do autor, hospedada por ele, mostrada num painel
isolado. O time aprova cada plugin, o admin do servidor instala os que quiser, e
cada membro liga os que quer ver. **Quem não liga nada não vê diferença nenhuma.**

O projeto tem três specs, nesta ordem:

1. **Esta spec: a base.** Ficha, API do ciclo de vida inteiro, instalação,
   escolha do membro, botão e painel, CSP e ADR.
2. **A loja na área de melhorias** (o diamante): vitrine, formulário de
   publicação, fila de aprovação do time, motivo da recusa e edição da ficha.
3. **O placar Galo/Cruzeiro:** a página do plugin, a fonte dos dados dos jogos e
   a publicação como primeiro plugin. Fecha a #480.

## Decisões (e o porquê)

| Decisão | Por quê |
|---|---|
| O plugin é uma página `https://` do autor num iframe com `sandbox` (ADR 0056) | Não roda código de terceiros junto da sessão. Mesmo código na web e no desktop, e cabe no popover da #480 |
| Sem bot e sem API de bot (moderação etc.) | Fora de escopo por decisão do usuário. Fica para um projeto futuro |
| Só desktop (Electron) e web. **O app Android (`mobile/`) não muda** | Decisão do usuário. O WebView nativo tem as próprias regras e fica para depois |
| Toda ficha nova passa por aprovação do time, quem está em `TECH_TEAM_USER_IDS` (a mesma lista das Propostas) | Mesmo isolada, uma página pode *parecer* a Salinha (phishing). A aprovação é a defesa |
| Quem instala é quem tem **"Gerenciar servidor"** (`ManageServer`). Não há permissão nova | Os bits `1<<0`..`1<<30` estão todos ocupados, e o `1<<31` quebra o bitwise do app (`permission/perms.go`). O usuário aprovou |
| Cada membro liga o plugin para si, por servidor. **Tudo vem desligado.** A escolha fica salva no backend e vale em qualquer dispositivo | "Sem mudar a experiência de quem não usa" |
| A loja é por instalação da Salinha: cada servidor próprio tem o próprio catálogo e o próprio time | Cada instalação tem o próprio banco. Uma loja compartilhada entre instalações seria outro projeto |
| O painel não recebe nada da Salinha (nem usuário, nem canal, nem tema) | O placar não precisa disso, e assim não há o que vazar. Um SDK por `postMessage` fica para quando houver necessidade |
| O ícone do botão vem da ficha, de uma lista fixa de SVGs da Salinha (`quebra-cabeca` padrão, `bola`); só o "Placar ao vivo" oficial usa `bola`. Nunca URL de imagem do autor | Carregar imagem do servidor do autor vazaria o IP de quem vê o botão (ADR 0056) |
| Um único lugar de aparecer: o botão na barra do canal de texto, ao lado dos pinados | É o que a #480 pede. Outros lugares ficam fora de escopo |
| Com três ou mais plugins ligados, a barra mostra um botão "Plugins" com um menu | A barra não estoura em 360 px (decisão minha, vista no rascunho) |
| Ficha retirada pelo time some de todos os servidores na hora, sem desinstalar | O time tem um botão de emergência contra plugin que virou abuso |

## Abordagens consideradas para o painel

1. **Iframe isolado num popover (escolhida).** Ver o ADR 0056.
2. **Janela própria, como as Atividades no desktop.** Descartada: não existe na
   web e não é o painelzinho que a #480 pede.
3. **Proxy por subdomínio próprio (`discordsays.com`).** Descartada por agora:
   DNS e certificado em toda instalação, e o tráfego dos plugins por nossa conta.
   Dá para migrar depois sem trocar a ficha.

## Arquitetura

### Backend: `backend/internal/plugin/`

Monólito modular, como o resto (model → repository → service → handler → routes),
ligado em `backend/cmd/wire_plugins.go`.

**Migration** (próximo número livre em `backend/migrations/`):

- `plugins`: `id` uuid, `name` (1–40), `description` (1–120), `panel_url` (https, obrigatória), `icon` (`quebra-cabeca` padrão | `bola`, lista fixa de SVGs da Salinha), `author_id` → users,
  `status` (`pending` | `approved` | `rejected`), `review_note` (motivo,
  opcional), `reviewed_by`, `created_at`, `updated_at`.
- `server_plugins`: `server_id` → servers (cascade), `plugin_id` → plugins
  (cascade), `installed_by`, `installed_at`. PK `(server_id, plugin_id)`.
- `member_plugins`: `server_id`, `user_id`, `plugin_id`, PK nos três. A linha
  existe só quando o plugin está **ligado**: desligar apaga a linha. Desinstalar
  apaga as linhas daquele servidor e plugin. Sair do servidor ou ser expulso
  também apaga (FK para o membro ou limpeza no mesmo ponto em que o servidor
  limpa os dados do membro).

**Regras do service:**

- **Criar ficha:** qualquer conta com e-mail confirmado (`requireVerified`). A
  ficha entra em `pending`. URLs só `https://`, com host válido, até 2048
  caracteres. O nome e a descrição seguem os limites acima.
- **Aprovar, recusar ou retirar:** só o time (`IsTech`). Transições:
  `pending → approved`, `pending → rejected`, `approved → rejected` (retirar,
  com motivo) e `rejected → approved` (reaprovar, vale para recusada e retirada).
  Um status só para recusada e retirada; o motivo diz qual foi (decisão minha). Retirar não apaga as instalações, mas a ficha deixa de aparecer
  para todo mundo e o evento de tempo real tira o botão. Se o time aprovar de
  novo, ela volta para quem já tinha instalado e ligado.
- **Listar o catálogo:** as fichas `approved`, para qualquer conta logada. O
  time também vê as `pending` e as `rejected` (para cadastrar e aprovar pela
  API nesta spec).
- **Listar os plugins do servidor:** para os membros do servidor. Devolve as
  fichas instaladas **e aprovadas**, com `enabled` (se eu liguei).
- **Instalar e desinstalar:** exige `ManageServer` no servidor. Instalar ficha
  que não está `approved` é erro.
- **Ligar e desligar para mim:** só membro do servidor, e só plugin instalado e
  aprovado. Fora disso, o pedido é ignorado sem erro (idempotente).

**Rotas** (formato livre para o builder; a lista é o mínimo):

- `GET /plugins` (catálogo), `POST /plugins` (criar), `PATCH /plugins/:id/review`
  (time: status e motivo).
- `GET /servers/:serverId/plugins`, `PUT /servers/:serverId/plugins/:pluginId`
  (instalar), `DELETE /servers/:serverId/plugins/:pluginId` (desinstalar),
  `PUT /servers/:serverId/plugins/:pluginId/me` com `{ enabled }`.

**Tempo real:** instalar, desinstalar, aprovar ou retirar uma ficha emite um
evento (ex.: `plugins_changed`) nas salas `server:` afetadas. O cliente relê
`GET /servers/:id/plugins`. Ligar ou desligar para mim emite só na sala `user:`
(os outros dispositivos da pessoa).

**Erros:** os do `permission` para quem não pode (403 `missing_permission`),
`forbidden` para quem não é do time, 400 com código para URL inválida e para
instalar ficha não aprovada, 404 para ficha inexistente.

### Frontend: `frontend/src/renderer/src/features/plugins/`

- `api/plugins.ts`: as chamadas acima.
- `store/pluginsStore.ts`: um store novo (Zustand), com os plugins por servidor.
  **Não toca** em `serverStore`, `chatStore` nem `callStore`. Escuta o
  `plugins_changed` e relê.
- `lib/`: as regras puras, cada uma com o `.test.ts` ao lado:
  - quais botões mostrar (instalado, aprovado e ligado);
  - quando agrupar (3 ou mais);
  - validação da URL no formulário (para a spec 2 reaproveitar).
- `components/`:
  - `PluginHeaderButtons`: entra em `features/servers/components/ChannelHeaderParts.tsx`
    (`ChannelActions`), ao lado do `PinnedMessagesPopover`. Um `IconButton` por
    plugin, com um ícone genérico de peça de quebra-cabeça (novo em
    `shared/ui/icons`) e o nome do plugin no `title`/`aria-label`, ou o botão "Plugins" com menu a partir de 3.
  - `PluginPanel`: o popover com o cabeçalho (nome e `CloseButton`), a linha
    *"Plugin de @{username} · conteúdo de fora da Salinha"* e o iframe. É o
    `username` único, não o nome de exibição, que poderia ser "Salinha Oficial"
    (decisão minha).
  - `PluginsSettingsTab`: a aba "Plugins" em `ServerSettingsScreen` /
    `ServerSettingsNav`. Quem tem "Gerenciar servidor" vê "Instalados neste
    servidor" (com o próprio interruptor e "Desinstalar") e "Disponíveis" (com
    "Instalar"). O membro comum vê "Plugins deste servidor" com interruptores.
    A aba aparece para todos os membros.
- O iframe: `sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"`
  (**sem** `allow-same-origin` e sem `allow-top-navigation`),
  `referrerPolicy="no-referrer"`, sem `allow=` de câmera, microfone etc. Monta só
  quando o painel abre e desmonta ao fechar.
- Se o arquivo tocado passar de 400 linhas ou já for god file, a regra 2 do
  AGENTS.md vale: extrair no mesmo PR.

### CSP e Electron

- `frame-src https:` na CSP do desktop (`renderer/index.html`) e da web
  (`WEB_EXTRA_CSP` em `shared/lib/serverUrl.ts`, que hoje lista só as origens das
  Atividades: passa a ser `https:`, que já as cobre). Atenção para não ficarem
  duas diretivas `frame-src` na web (vale a primeira).
- **A navegação dentro do iframe não é presa à origem** (decisão minha): o main
  não conhece a `panel_url` e prender exigiria IPC novo no preload, além de
  quebrar redirecionamentos legítimos (`foo.com` → `www.foo.com`). Não ganha
  segurança real: o autor já pode trocar o conteúdo da própria URL depois de
  aprovado. O que protege é o `sandbox` (sem `allow-top-navigation`), a CSP só
  `https:`, a linha do autor no painel e a retirada pelo time.
- **O main do Electron não muda.** O `will-navigate` só dispara para o frame
  principal, que o `sandbox` já impede o plugin de navegar. Os popups do plugin
  (`window.open`, `target=_blank`) caem no `setWindowOpenHandler` atual: http/https
  abre no navegador de fora. Um link de convite da Salinha aberto pelo plugin
  mostra a confirmação de entrada, que a pessoa precisa aceitar. O Electron 44
  não informa o frame de origem no handler, então não há como separar, e isso é
  aceitável.

## Comportamento responsivo

- **≥ 768 px:** o painel é um popover ancorado no botão, com cerca de 360 × 480
  px e limitado à altura da janela.
- **< 768 px (até 360):** o painel vira uma folha de baixo, com largura total e
  cerca de 70% da altura, fechando no `CloseButton`, no Esc e num toque fora.
- A aba "Plugins" é uma lista de uma coluna em qualquer largura. Nome e
  descrição truncam com reticências, e os botões não quebram.
- Tudo funciona por toque e teclado: Tab até o botão, Enter abre, Esc fecha e o
  foco volta para o botão, com `focus-ring`. Os interruptores são `role="switch"`
  com `aria-checked`. Nada depende de hover.

## Textos aprovados

| Onde | Texto |
|---|---|
| Aba nas configurações | Plugins |
| Seção do admin | Instalados neste servidor |
| Seção do admin | Disponíveis |
| Botões | Instalar · Desinstalar |
| Dica do admin | Instalar só deixa o plugin disponível. Cada membro escolhe se quer usar. |
| Seção do membro | Plugins deste servidor |
| Dica do membro | Ligue os que quiser ver na barra dos canais. Só muda para você. |
| Vazio | Nenhum plugin instalado neste servidor ainda. |
| Linha do painel | Plugin de @{username} · conteúdo de fora da Salinha |
| Erro do painel | Não deu para abrir este plugin agora. |
| Botão do erro | Tentar de novo |
| Botão agrupado | Plugins |

Qualquer outro texto que o usuário final leia e que não esteja aqui (ex.:
`aria-label`, toast de erro ao instalar) precisa de aprovação antes do commit.

## Erros e casos de borda

- **Página do plugin fora do ar, ou que bloqueia iframe:** o painel mostra o erro
  com "Tentar de novo". O `onLoad` do iframe não diz se a página é de erro, então
  o critério é um tempo limite sem `load` (ex.: 10 s); a escolha fica com o
  builder.
- **URL que não é `https://`:** o backend recusa ao criar.
- **Quem não tem "Gerenciar servidor":** não vê "Instalar" nem "Desinstalar", e o
  backend devolve 403 se tentar mesmo assim.
- **Desinstalado ou retirado com o painel aberto:** o painel fecha e o botão some.
- **Plugin tentando sair do app:** sem `allow-top-navigation` ele não troca a
  página da Salinha, os popups abrem no navegador de fora, e a navegação do
  frame para outra origem é barrada.

## Fora de escopo

- Bots, API de bot, eventos de mensagem, moderação.
- O app Android (`mobile/`).
- A tela da loja, o formulário de publicação e a fila de aprovação (spec 2).
  Nesta spec, o ciclo da ficha existe só pela API.
- Editar a ficha depois de criada (spec 2: editar volta para `pending`).
- O plugin do placar e a fonte dos dados (spec 3).
- SDK ou `postMessage` entre o painel e a Salinha, tema, usuário, canal.
- Ícone próprio do plugin (spec 2, por upload servido pela Salinha: carregar o
  ícone do servidor do autor entregaria o IP de todo membro que vê a barra).
- Outros lugares de aparecer (barra lateral, mensagens, comandos).
- Loja compartilhada entre instalações da Salinha.
- Ordenar os botões dos plugins (a ordem é a de instalação).

## Testes

- **Go**, `internal/plugin`:
  - service com fakes: transições de status, quem pode o quê (time,
    `ManageServer`, membro), validação de URL, instalar ficha não aprovada,
    ligar o que não está instalado, desinstalar limpando as escolhas, e retirar
    escondendo a ficha sem apagar a instalação;
  - repository em `*_db_test.go` contra o Postgres, como nos outros domínios;
  - evento emitido nas salas certas.
- **Front:**
  - a `lib/` (filtro e agrupamento);
  - `PluginsSettingsTab` como admin e como membro (Testing Library);
  - `PluginPanel`: abre, mostra autor e iframe com o `sandbox` exato, erro e
    "Tentar de novo", Esc fecha;
  - `PluginHeaderButtons` com 0, 1, 2 e 3 plugins;
  - a CSP (`frame-src https:`) nos testes do `serverUrl`.
- Rodar `node scripts/affected-tests.mjs loop` a cada ciclo e `pr` no fim.

## Verificação de ponta a ponta

Com o backend local (`scripts/server-up.sh`) e duas contas, A (dono e no time via
`TECH_TEAM_USER_IDS`) e B (membro comum):

1. A cria uma ficha pela API, com `panel_url` numa página https qualquer que
   aceite iframe. A ficha fica `pending`, e B não a vê no catálogo.
2. A aprova pela API.
3. A abre Configurações do servidor → Plugins e instala. A barra de B não muda.
4. B liga o plugin na aba. O botão aparece ao lado dos pinados, e o painel abre
   com a página, o autor e a linha "conteúdo de fora da Salinha".
5. No DevTools, conferir que o iframe não lê `document.cookie` nem o
   `localStorage` da Salinha (origem opaca) e que `top.location = ...` é
   bloqueado.
6. A desinstala. O botão some para B sem recarregar.
7. Reinstalar e retirar a ficha pela API: o botão some para B.
8. Repetir os passos 4 e 6 na web (`yarn dev:web`) e conferir 360, 768 e 1280 px.
9. Com uma `panel_url` fora do ar, aparece o erro com "Tentar de novo".
