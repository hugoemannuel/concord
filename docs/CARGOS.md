# Cargos e permissões

Cada servidor tem **cargos** com permissões, como no Discord.

## O dono

O **dono** (quem criou o servidor, `owner_id`) **não é um cargo**: é um nível interno e absoluto, preso à pessoa.

- Pode tudo sem precisar de cargo nenhum e ignora as regras dos canais.
- Está acima de qualquer cargo na hierarquia: mesmo sem cargo, expulsa, bane, silencia, move e mexe nos cargos de qualquer membro.
- Nunca é alvo de expulsão, banimento, silêncio, ensurdecer, desconectar, mover nem troca de apelido ou de cargos por outra pessoa (nem por quem tem Administrador). Também não sai do servidor: apaga.
- Pode dar e tirar de si mesmo qualquer cargo, só para a cor e o grupo na lista.
- Na lista de membros, no perfil e na aba Membros, aparece como qualquer membro (agrupado e colorido pelo cargo que tiver) com uma **coroa** ao lado do nome ("Dono do servidor").

## Como as permissões são calculadas

1. Todo membro tem o cargo **@everyone** (posição 0, não se apaga nem renomeia).
2. Soma-se (OU) as permissões de cada cargo que o membro tem.
3. Quem tem **Administrador** (e o dono) fica com tudo e ignora as regras dos canais.
4. Em cada canal, as **sobrescritas** são aplicadas nesta ordem — em cada etapa, *negar* tira e *permitir* põe:
   1. a do @everyone;
   2. as dos cargos do membro (somadas: se um cargo permite, vale);
   3. a do próprio membro (vence tudo).
5. Sem **Ver canais** o resultado é zero: o canal nem aparece. Sem *Enviar mensagens* caem *Enviar arquivos*, *Mencionar @all* e *Enviar mensagens TTS* (no canal de texto e no chat do canal de voz). Em voz, sem *Conectar* caem falar, transmitir, mesa de áudio e moderação.

6. Canal dentro de uma categoria só existe para quem **vê a categoria**: a conta da categoria é a mesma de um canal, e sem *Ver canais* nela o resultado no canal é zero, mesmo com permissão própria. O dono e o Administrador sempre veem. Ver "Categorias privadas" abaixo.

O cálculo é o mesmo no backend (`backend/internal/permission`) e no app (`frontend/src/renderer/src/features/servers/lib/permissions.ts`). Os dois rodam os mesmos casos de `backend/internal/permission/testdata/vectors.json`: mudou uma regra, mude os casos e os dois lados.

## Permissões

| Grupo | Permissão | Efeito |
|---|---|---|
| Geral | Ver canais | Vê o canal (sem isso ele é invisível). |
| | Gerenciar canais | Criar, editar, reordenar e apagar canais (inclui o modo lento). Isenta do modo lento. |
| | Gerenciar cargos | Criar/editar cargos abaixo do seu, dar e tirar cargos, editar permissões de canal. |
| | Gerenciar servidor | Nome, ícone, canal principal e a customização: perfil do servidor (banner, traços, descrição, jogos, perfil privado), tag, faixa e tema de fundo. Ver [ADR 0050](adr/0050-customizacao-do-servidor.md). |
| | Ver registro de auditoria | Ver em Configurações do servidor → Registro de auditoria quem fez cada ação de moderação e administração (últimos 90 dias). **Fora do @everyone**: só o dono, o Administrador e os cargos que ganharem. Ver [ADR 0036](adr/0036-registro-de-auditoria.md). |
| | Criar convite | Convidar amigos e ver o código do servidor. |
| | Gerenciar mesa de áudio | Apagar áudios (e figurinhas) de outras pessoas. |
| | Adicionar sons | Enviar sons novos para a mesa de áudio do servidor. Vale no servidor todo (não há sobrescrita por canal). |
| | Adicionar figurinhas | Enviar figurinhas novas para o servidor. Vale no servidor todo. |
| | Adicionar emojis | Enviar emojis personalizados novos para o servidor (até 50). Vale no servidor todo. |
| Membros | Expulsar / Banir | Tirar o membro (o ban impede de voltar até desbanir). |
| | Administrador | Tudo, ignorando os canais. |
| Texto | Enviar mensagens, Enviar arquivos, Adicionar reações, Ver histórico | Uso normal do chat. |
| | Encaminhar (sem permissão própria) | Encaminha quem lê a mensagem (*Ver canais* na origem, ou participa da DM) para onde pode escrever: *Enviar mensagens* no canal de destino, mais *Enviar arquivos* se ela tem anexo; numa DM, a regra de escrever nela. A encaminhada não pinga ninguém e não pode ser editada. Ver [ADR 0062](adr/0062-encaminhar-mensagens.md). |
| | Usar emojis e figurinhas de outros servidores | Usar em mensagens e reações deste servidor os emojis e figurinhas de outros servidores de que a pessoa participa. Vem ligada no @everyone e vale por canal. Em DM e grupo não há servidor de destino: basta ser membro do servidor de origem. Sem ela, os itens de fora aparecem desabilitados no seletor; quem mandar assim mesmo vê o emoji virar `:nome:` no texto e a figurinha e a reação serem recusadas. Somar-se a uma reação que já está na mensagem não pede a permissão. Ver [ADR 0054](adr/0054-emojis-de-outros-servidores.md). |
| | Mencionar @all e @here | Avisar o canal inteiro. |
| | Enviar mensagens TTS | Usar `/tts`: a mensagem é lida em voz para quem está em call no servidor (até 200 caracteres, uma a cada 10 s). Vem ligada no @everyone (no Discord vem desligada); quem quiser restringir desliga no cargo ou no canal. Ver [ADR 0012](adr/0012-tts-no-cliente.md). |
| | Gerenciar mensagens | Apagar mensagem de outros e encerrar enquetes. Isenta do modo lento. |
| Voz | Conectar, Falar, Transmitir | Entrar, usar o microfone, compartilhar tela/câmera. |
| | Usar mesa de áudio | Tocar os sons na chamada (os do servidor e os favoritos de outros servidores). Enviar som é *Adicionar sons*. |
| | Silenciar / Ensurdecer / Mover membros | Moderação na chamada (mover inclui desconectar). |
| | Convidar visitantes | Gerar, na call em que está, um link para alguém de fora do servidor entrar só nela, por tempo limitado (ver "Visitantes" abaixo). **Fora do @everyone**: só o dono, o Administrador e os cargos que ganharem. Vale por canal (sobrescrita do canal de voz). |

Padrões de um servidor novo: só o **@everyone** (ver, escrever, anexar, reagir, histórico, convidar, conectar, falar, transmitir, mesa de áudio, alterar o próprio apelido, adicionar sons e figurinhas, mensagens TTS, usar emojis e figurinhas de outros servidores) e o cargo fixo **Bots** (dos bots do servidor). Não há mais cargo **Moderador** padrão: quem quiser cria os seus. Nos servidores antigos o Moderador que já existia continua, como um cargo comum (dá para editar, mover e apagar).

**Perfil por servidor** ([ADR 0051](adr/0051-perfil-por-servidor.md)): todo membro edita o próprio perfil em cada servidor (avatar, banner, cor, estilo do nome, pronomes, nota, Sobre mim, links, tema, faixa e moldura), sem permissão nenhuma. O nome nesse perfil é o apelido: *Alterar o próprio apelido* controla só ele. Sem ela, o nome fica travado e o resto continua liberado; um apelido imposto pela moderação não some ao apagar o perfil. Ninguém edita o perfil de servidor de outra pessoa.

## Hierarquia

A posição do cargo define quem manda em quem (maior = mais alto).

- Só se edita, dá ou tira um cargo que esteja **abaixo do seu cargo mais alto** (o dono, qualquer um). Vale também para os próprios cargos: o dono dá e tira de si mesmo qualquer cargo (no menu *Cargos ›* do próprio nome e na aba Membros).
- Os cargos **do dono** só ele mesmo mexe (nem quem tem Administrador).
- Expulsar, banir, silenciar, ensurdecer, desconectar e mover só vale sobre quem tem o cargo mais alto **menor** que o seu. Mesma posição não vale.
- Ninguém dá ou tira uma permissão que **não tem** (Administrador pode tudo).
- **Administrador** tem todas as permissões, mas a hierarquia vale para ele também: age sobre quem tem o cargo mais alto menor que o seu. Quem não tem cargo nenhum (só o @everyone, posição 0) está abaixo de qualquer cargo, então qualquer administrador com um cargo age sobre ele. Administrador dado só pelo @everyone não age sobre outros membros sem cargo (mesma posição); para isso, precisa de um cargo.

## Modo lento

Em **Editar canal**, quem tem *Gerenciar canais* escolhe um intervalo mínimo entre as mensagens de cada membro naquele canal (desligado, 5 s, 10 s, 15 s, 30 s, 1 min, 2 min, 5 min, 10 min, 15 min, 30 min, 1 h, 2 h ou 6 h). Vale no canal de texto e no chat do canal de voz; DM e grupo não têm.

- Conta toda mensagem nova (texto, anexo, áudio, figurinha, GIF e `/tts`); editar, reagir e comandos do Maestro não contam.
- Quem tem **Gerenciar mensagens** ou **Gerenciar canais** no canal fica isento (o dono e o Administrador também). Não há permissão própria: os bits acabaram (ADR 0054).
- O servidor recusa com 429 (`code: "slowmode"`, `retry_after` em segundos); o app mostra a faixa "Modo lento" acima do campo, com a contagem. A vez de cada um fica em memória: reiniciar o backend libera uma mensagem a mais.

## Categorias privadas

*Categoria privada* é a categoria em que o @everyone não tem **Ver canais**. Quem vê é quem foi escolhido (cargos e membros) em "Categoria privada" ao criar ou editar, ou em **Permissões da categoria**. Ver [ADR 0055](adr/0055-categorias-normais-e-privadas.md).

- **Canal vinculado** tem as mesmas regras da categoria, copiadas nele. Mudar a categoria muda os vinculados. Canal novo sem regras próprias nasce vinculado.
- **Canal com permissão própria** não acompanha a categoria: aparece com um aviso, e **Sincronizar com a categoria** faz voltar a seguir. A categoria continua valendo: ele pode fechar mais, nunca abrir para quem não a vê.
- **Mover** não abre canal: canal público ou vinculado que entra numa categoria herda dela, mas privado que vai para categoria aberta (ou fica solto) continua privado. Abrir é explícito, com Sincronizar.
- **Excluir a categoria** deixa os canais soltos no topo. Nenhum canal é apagado e nenhum abre: quem tinha permissão própria recebe as restrições da categoria.
- Canais de sistema e de evento não recebem regras da categoria: ela só os esconde, enquanto estiverem dentro. Fora dela, voltam a valer para todos (canal de sistema não tem regras próprias).
- Criar categoria privada exige *Gerenciar canais*. Mudar quem vê uma categoria que já existe, e sincronizar um canal, exige também *Gerenciar cargos* (mexe nas permissões dos canais), e só se mexe nos bits que o próprio ator tem.
- Quem não vê a categoria recebe 404 em toda rota dela, mesmo com *Gerenciar canais*, e não a recebe em nenhuma lista nem evento.

## Canais privados

*Canal privado* é o canal em que o @everyone não tem **Ver canais**. Quem vê é quem tem um cargo (ou o próprio nome) liberado na aba **Permissões** do canal. O servidor não manda o canal, as mensagens nem os eventos de tempo real para quem não vê, e tira da sala quem perde o acesso na hora (cargo tirado, canal virou privado, expulsão).

## Voz

- Cada canal de voz tem um **chat próprio** (como o "Text in Voice" do Discord): valem as permissões de texto do canal (*Ver canais* + *Ver histórico* para ler, *Enviar mensagens* para escrever, etc.), sem precisar de *Conectar*. O editor de permissões do canal de voz mostra esse grupo como "Chat do canal de voz".
- Entrar exige **Conectar**; o token do LiveKit só deixa publicar o microfone com **Falar** e tela/câmera com **Transmitir**.
- *Silenciar* e *Ensurdecer no servidor* tiram do LiveKit a permissão de publicar / de ouvir e valem até um moderador liberar ou a chamada acabar. Ao liberar, o LiveKit devolve a escuta sozinho e o app republica o microfone e desmuta quem só estava mudo por causa do silêncio (quem já estava mudo por escolha continua mudo).
- Mudou um cargo ou canal no meio da chamada? Quem perdeu o acesso sai da chamada e quem perdeu falar/transmitir tem a mídia ajustada na hora.

## Castigo

Castigo nas calls do servidor por um tempo ([ADR 0063](adr/0063-castigo-na-call.md)).

- O castigo tira, em todos os canais de voz do servidor, um ou mais destes: **falar**, **entrar na call** (quem está numa sai na hora) e **escutar**. Prazos: 1, 5, 10 ou 30 minutos ou 1 hora. Acaba sozinho no fim do prazo, mesmo que o servidor reinicie no meio. Castigos somados ficam com o prazo mais longo de cada efeito.
- **Aplicar direto** (e tirar antes da hora) pede, no servidor, a moderação de voz de cada efeito: falar → *Silenciar membros*; escutar → *Ensurdecer membros*; entrar → *Desconectar membros*. E vale a hierarquia: só sobre quem tem o cargo mais alto menor que o seu.
- **Votação**: qualquer membro que está na call abre, contra outra pessoa da call. Votam os membros do servidor que estavam na call quando a votação abriu, **menos o alvo** (ele não vota e não conta). O castigo vale com **mais da metade** desses votos (quem abre já vota sim). Precisa de pelo menos 2 votantes (call com 3 pessoas ou mais). Dura 60 s, uma por call; quem abre espera 30 s para abrir outra. Visitantes não abrem nem votam.
- O dono nunca fica de castigo; ninguém castiga a si mesmo. Silenciar ou ensurdecer no servidor não mexe no castigo, e liberar o silêncio não tira o castigo de falar.
- Fica no registro de auditoria: quem castigou (na votação, quem abriu), o quê, por quanto tempo e se foi votação; e quem tirou.

## Visitantes

Convite de visitante para uma call ([ADR 0017](adr/0017-visitante-na-call.md)).

- Quem tem **Convidar visitantes** no canal de voz e está na call dele gera o link (2 h, 6 h, 12 h ou 1 dia) e escolhe se o visitante pode **Falar** e usar **Câmera e tela** (o mesmo *Transmitir* dos cargos). Ouvir e assistir às transmissões valem sempre.
- O visitante não vira membro: o servidor só o deixa entrar no canal de voz do convite (ver e conectar ali, com as permissões do convite). Não vê canais, chats (nem o do canal de voz), membros nem outros servidores. Sem conta, ele entra com um nome e um token de visitante que só abre as rotas da call e o WebSocket; com conta, entra com a própria conta (banido do servidor não entra; membro abre o canal normalmente).
- Visitante não tranca a sala, não aceita pedidos para entrar, não abre atividade nem toca a mesa de áudio.
- Moderador pode silenciar, ensurdecer, desconectar e **mover** o visitante (mover troca o canal permitido). Mudar cargos do servidor não tira o visitante da call.
- O acesso acaba no fim do prazo (o servidor tira da call e encerra a sessão), ao revogar o link (todos que entraram por ele saem) ou ao **expulsar** o visitante. Antes disso, quem sai pode voltar pelo mesmo link.
- Ver, revogar links e expulsar visitantes: **Convidar visitantes** ou **Desconectar membros** no canal.

## API (resumo)

| Rota | Permissão |
|---|---|
| `GET/POST /servers/:id/roles`, `PATCH/DELETE …/roles/:roleId`, `PUT …/roles/order` | membro / Gerenciar cargos |
| `PUT/DELETE /servers/:id/members/:userId/roles/:roleId` | Gerenciar cargos (cargo abaixo do seu; nos cargos do dono, só o dono) |
| `PUT/DELETE /servers/:id/channels/:channelId/overwrites/:role\|member/:targetId` | Gerenciar cargos no canal |
| `PUT /servers/:id/channels/:channelId` com `name` e `slowmode_seconds` | Gerenciar canais |
| `POST /servers/:id/channels` com `private` e `role_ids` | Gerenciar canais |
| `POST /servers/:id/categories` (com `private`, `role_ids` e `member_ids`), `PUT /categories/:id` (só o nome), `DELETE`, ordem e `PUT /categories/channels/:id` | Gerenciar canais e ver a categoria |
| `PUT /servers/:id/categories/:id` com `private`, `PUT` e `DELETE /categories/:id/overwrites/:type/:targetId`, `POST /categories/channels/:id/sync` | Gerenciar canais + Gerenciar cargos e ver a categoria; só bits que o ator tem |
| `DELETE /servers/:id/members/:userId`, `POST /servers/:id/leave` | Expulsar / o próprio membro |
| `GET/POST /servers/:id/bans`, `DELETE …/bans/:userId` | Banir |
| `GET /servers/:id/audit-log?actor_id=&action=&before=&limit=` | Ver registro de auditoria |
| `POST /calls/:id/participants/:userId/server-mute`, `…/server-deafen`, `DELETE …/participants/:userId` | Silenciar / Ensurdecer / Mover |
| `GET /servers/:id/castigos`, `POST /servers/:id/castigos`, `DELETE …/castigos/:userId` | membro / a moderação de voz de cada efeito (ver "Castigo") |
| `POST /calls/:id/castigo-votes`, `GET …/castigo-votes/current`, `POST …/castigo-votes/:voteId/ballots` | estar na call (membro) |
| `POST /guest-invites` (estar na call do canal) | Convidar visitantes |
| `GET /guest-invites?channel_id=`, `DELETE /guest-invites/:id`, `POST /guests/:userId/end` | Convidar visitantes ou Desconectar membros |
| `GET /guest-invites/:token`, `POST /guest-invites/:token/join` | público (limite por IP) |
| `POST /expressions/resolve` | com login: nome e origem dos emojis e figurinhas que a pessoa pode conhecer (membro da origem, ou item já usado fora dela); servidor privado não diz o nome |

Reagir com emoji de outro servidor sem poder responde 403 com `code` `external_expression`. Erros de permissão vêm com `code` (`missing_permission`, `role_hierarchy`, `owner_roles`, `cannot_grant`, `banned`, `not_member`…) e o app os traduz.

## Eventos em tempo real

`role:create|update|delete|reorder`, `server:member:roles`, `server:permissions:invalidate` (o app relê canais, cargos e membros), `server:removed` (`reason`: `leave`, `kick` ou `ban`), `castigo:update` (o castigo de alguém no servidor, com os prazos nulos quando acaba) e `castigo:vote` (a votação, só para a call). `message:create/delete`, `channel:create/update` e `call:*` de canais só chegam a quem vê o canal.
