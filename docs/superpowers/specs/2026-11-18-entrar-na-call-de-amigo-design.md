# Entrar na call de um amigo pela coluna "Ativo agora"

Issue: [#609](https://github.com/hugoemannuel/concord/issues/609) (proposta da comunidade, 13 x 0).
Tamanho: mudança pequena, só frontend (desktop/web).

## Objetivo

Na tela de Amigos, a coluna da direita lista em "Ativo agora" os amigos que estão
em canais de voz, mas o card é estático ("Em um canal de voz") e não leva a lugar
nenhum. Queremos que o card mostre **onde** o amigo está e que um clique leve você
para a mesma call, como o "Entrar no canal" do Discord.

## Decisões (e o porquê)

| Decisão | Por quê |
|---|---|
| Só canais de voz de servidores em que você e o amigo estão | É o que a coluna já lista (`serverCalls`). Calls de DM e grupo não foram feitas para outras pessoas entrarem. |
| Um card **por amigo** (modelo A); dois amigos no mesmo canal = dois cards | Escolha do usuário entre 3 modelos; mantém o formato atual do card. |
| O card mostra o servidor, o canal e os avatares de quem está na call (até 5 avatares e depois "+N") | O usuário quer saber onde vai cair e com quem antes de entrar. O limite de 5 é escolha nossa. |
| Não indica se a sala está trancada | O usuário não quis. |
| O card inteiro é o botão (mouse, toque, Enter/Espaço, `focus-ring`) | Modelo A. |
| Clique = `joinVoiceChannel(channelId)` e depois navegar para `/servers/:serverId/channels/:channelId` | Mesmo comportamento de clicar no canal pela lista do servidor; já cuida de sala trancada (bater na porta), troca de canal e "já estou aqui". |
| Sem checagem de permissão antes do clique; o backend recusa (`requireConnect` → `ErrNoConnect`) e o app mostra o aviso | No front, a checagem só existe para o servidor aberto. Carregar cargos de todos os servidores seria caro e duplicaria a regra (caminho 3, descartado). |
| Em call de DM: continua recusando ("Você já está em uma chamada.") | Fica como hoje, para não aumentar o escopo. |
| Coluna continua só em telas a partir de 1280 px (`xl`); nada no Android | Decisão do usuário. |

### Abordagens consideradas

1. **Tudo no front, reaproveitando o que já existe (escolhida).** Os cards saem de `serverCalls`; o nome do servidor vem de `serverStore.servers`; o nome do canal vem de `channelNameStore` (o cache que o painel de voz já usa). Sem mudança no backend.
2. **O backend manda o nome do canal em `/calls/active`.** Mexe na API para algo que o cache já resolve e pode desatualizar quando alguém renomear o canal. Descartada.
3. **Checar no front a permissão de conectar em todos os servidores.** Carrega cargos e membros de cada servidor só para esta tela e duplica a regra do backend. Descartada.

Não foge do padrão do repo: não precisa de ADR.

## Arquitetura

- `features/friends/lib/onlineFriends.ts`: `friendsInVoice` passa a devolver, para cada
  amigo, também a entrada da call (servidor, canal, participantes). Continua puro e testado.
- `features/friends/components/ActiveNow.tsx`: o `ActiveVoiceFriendCard` vira um
  `<button>` com o novo conteúdo. Se o arquivo crescer, o card vai para um arquivo
  próprio em `features/friends/components/` (regra anti-god file).
- Nome do canal: reaproveitar `useCallChannelName(serverId, channelId)` (`features/call/hooks/`).
  Enquanto o nome não chega, mostrar "Canal de voz", como no painel de voz.
- A ação de entrar fica num hook pequeno (ex.: `features/call/hooks/useJoinFriendCall.ts`):
  `joinVoiceChannel` → navegar; em caso de erro, `showToast.error(errorText(err, ...))`.
  **Não** adicionar campos ao `callStore` (god store).
- Avatares empilhados com `Avatar` de `shared/ui`; ícone de alto-falante SVG de
  `shared/ui/icons`; cores e tamanhos só por tokens.

## Textos aprovados

| Onde | Texto |
|---|---|
| 2ª linha do card | `<Servidor> · <canal>` (sem o nome do canal: `<Servidor> · Canal de voz`) |
| Ao lado dos avatares | `1 na call` / `N na call`; com mais de 5 pessoas, os 5 avatares e depois `+N` |
| `aria-label` do card | `Entrar na call de <amigo> em <canal>` |
| Erros | Os que já existem: "você não tem permissão para entrar neste canal de voz" (backend), "Você já está em uma chamada.", "Falha ao conectar ao canal de voz." |

A descrição vazia da seção ("Por enquanto está tudo quieto…") não muda.

## Fora de escopo

- Calls de DM e de grupo.
- Indicar sala trancada no card.
- Mostrar "Ativo agora" abaixo de 1280 px e no app Android.
- Agrupar amigos do mesmo canal num card só.
- Trocar de uma call de DM para o canal do amigo.

## Verificação de ponta a ponta

- **Unitários:** `friendsInVoice` com amigo em canal, dois amigos no mesmo canal,
  amigo fora de call e call sem `server_id`. Card: renderiza servidor, canal e
  "N na call"; "+N" com mais de 5; clique e Enter chamam a ação; erro vira toast.
- **Manual com 2 contas** (backend local): o amigo entra em `#Geral` → o card aparece
  com servidor, canal e avatar → clicar entra e abre a tela do canal; com a sala
  trancada, bate na porta; sem CONNECT, aparece o aviso; já em outro canal,
  troca; já no mesmo canal, só abre a tela.
- **Responsivo:** em 1280 px e em tela larga, o card não quebra com nomes longos (`truncate`); abaixo de 1280 px a coluna continua escondida.
- `node scripts/affected-tests.mjs pr` verde; CRAP ≤ 15 nas funções tocadas.
