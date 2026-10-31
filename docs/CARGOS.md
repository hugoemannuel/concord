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

O cálculo é o mesmo no backend (`backend/internal/permission`) e no app (`frontend/src/renderer/src/features/servers/lib/permissions.ts`). Os dois rodam os mesmos casos de `backend/internal/permission/testdata/vectors.json`: mudou uma regra, mude os casos e os dois lados.

## Permissões

| Grupo | Permissão | Efeito |
|---|---|---|
| Geral | Ver canais | Vê o canal (sem isso ele é invisível). |
| | Gerenciar canais | Criar, editar, reordenar e apagar canais. |
| | Gerenciar cargos | Criar/editar cargos abaixo do seu, dar e tirar cargos, editar permissões de canal. |
| | Gerenciar servidor | Nome, ícone e canal principal. |
| | Ver registro de auditoria | Ver em Configurações do servidor → Registro de auditoria quem fez cada ação de moderação e administração (últimos 90 dias). **Fora do @everyone**: só o dono, o Administrador e os cargos que ganharem. Ver [ADR 0036](adr/0036-registro-de-auditoria.md). |
| | Criar convite | Convidar amigos e ver o código do servidor. |
| | Gerenciar mesa de áudio | Apagar áudios (e figurinhas) de outras pessoas. |
| | Adicionar sons | Enviar sons novos para a mesa de áudio do servidor. Vale no servidor todo (não há sobrescrita por canal). |
| | Adicionar figurinhas | Enviar figurinhas novas para o servidor. Vale no servidor todo. |
| | Adicionar emojis | Enviar emojis personalizados novos para o servidor (até 50). Vale no servidor todo. |
| Membros | Expulsar / Banir | Tirar o membro (o ban impede de voltar até desbanir). |
| | Administrador | Tudo, ignorando os canais. |
| Texto | Enviar mensagens, Enviar arquivos, Adicionar reações, Ver histórico | Uso normal do chat. |
| | Mencionar @all e @here | Avisar o canal inteiro. |
| | Enviar mensagens TTS | Usar `/tts`: a mensagem é lida em voz para quem está em call no servidor (até 200 caracteres, uma a cada 10 s). Vem ligada no @everyone (no Discord vem desligada); quem quiser restringir desliga no cargo ou no canal. Ver [ADR 0012](adr/0012-tts-no-cliente.md). |
| | Gerenciar mensagens | Apagar mensagem de outros e encerrar enquetes. |
| Voz | Conectar, Falar, Transmitir | Entrar, usar o microfone, compartilhar tela/câmera. |
| | Usar mesa de áudio | Tocar os sons na chamada (os do servidor e os favoritos de outros servidores). Enviar som é *Adicionar sons*. |
| | Silenciar / Ensurdecer / Mover membros | Moderação na chamada (mover inclui desconectar). |
| | Convidar visitantes | Gerar, na call em que está, um link para alguém de fora do servidor entrar só nela, por tempo limitado (ver "Visitantes" abaixo). **Fora do @everyone**: só o dono, o Administrador e os cargos que ganharem. Vale por canal (sobrescrita do canal de voz). |

Padrões de um servidor novo: só o **@everyone** (ver, escrever, anexar, reagir, histórico, convidar, conectar, falar, transmitir, mesa de áudio, alterar o próprio apelido, adicionar sons e figurinhas, mensagens TTS) e o cargo fixo **Bots** (dos bots do servidor). Não há mais cargo **Moderador** padrão: quem quiser cria os seus. Nos servidores antigos o Moderador que já existia continua, como um cargo comum (dá para editar, mover e apagar).

## Hierarquia

A posição do cargo define quem manda em quem (maior = mais alto).

- Só se edita, dá ou tira um cargo que esteja **abaixo do seu cargo mais alto** (o dono, qualquer um). Vale também para os próprios cargos: o dono dá e tira de si mesmo qualquer cargo (no menu *Cargos ›* do próprio nome e na aba Membros).
- Os cargos **do dono** só ele mesmo mexe (nem quem tem Administrador).
- Expulsar, banir, silenciar, ensurdecer, desconectar e mover só vale sobre quem tem o cargo mais alto **menor** que o seu. Mesma posição não vale.
- Ninguém dá ou tira uma permissão que **não tem** (Administrador pode tudo).
- **Administrador** tem todas as permissões, mas a hierarquia vale para ele também: age sobre quem tem o cargo mais alto menor que o seu. Quem não tem cargo nenhum (só o @everyone, posição 0) está abaixo de qualquer cargo, então qualquer administrador com um cargo age sobre ele. Administrador dado só pelo @everyone não age sobre outros membros sem cargo (mesma posição); para isso, precisa de um cargo.

## Canais privados

*Canal privado* é o canal em que o @everyone não tem **Ver canais**. Quem vê é quem tem um cargo (ou o próprio nome) liberado na aba **Permissões** do canal. O servidor não manda o canal, as mensagens nem os eventos de tempo real para quem não vê, e tira da sala quem perde o acesso na hora (cargo tirado, canal virou privado, expulsão).

## Voz

- Cada canal de voz tem um **chat próprio** (como o "Text in Voice" do Discord): valem as permissões de texto do canal (*Ver canais* + *Ver histórico* para ler, *Enviar mensagens* para escrever, etc.), sem precisar de *Conectar*. O editor de permissões do canal de voz mostra esse grupo como "Chat do canal de voz".
- Entrar exige **Conectar**; o token do LiveKit só deixa publicar o microfone com **Falar** e tela/câmera com **Transmitir**.
- *Silenciar* e *Ensurdecer no servidor* tiram do LiveKit a permissão de publicar / de ouvir e valem até um moderador liberar ou a chamada acabar. Ao liberar, o LiveKit devolve a escuta sozinho e o app republica o microfone e desmuta quem só estava mudo por causa do silêncio (quem já estava mudo por escolha continua mudo).
- Mudou um cargo ou canal no meio da chamada? Quem perdeu o acesso sai da chamada e quem perdeu falar/transmitir tem a mídia ajustada na hora.

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
| `POST /servers/:id/channels` com `private` e `role_ids` | Gerenciar canais |
| `DELETE /servers/:id/members/:userId`, `POST /servers/:id/leave` | Expulsar / o próprio membro |
| `GET/POST /servers/:id/bans`, `DELETE …/bans/:userId` | Banir |
| `GET /servers/:id/audit-log?actor_id=&action=&before=&limit=` | Ver registro de auditoria |
| `POST /calls/:id/participants/:userId/server-mute`, `…/server-deafen`, `DELETE …/participants/:userId` | Silenciar / Ensurdecer / Mover |
| `POST /guest-invites` (estar na call do canal) | Convidar visitantes |
| `GET /guest-invites?channel_id=`, `DELETE /guest-invites/:id`, `POST /guests/:userId/end` | Convidar visitantes ou Desconectar membros |
| `GET /guest-invites/:token`, `POST /guest-invites/:token/join` | público (limite por IP) |

Erros de permissão vêm com `code` (`missing_permission`, `role_hierarchy`, `owner_roles`, `cannot_grant`, `banned`, `not_member`…) e o app os traduz.

## Eventos em tempo real

`role:create|update|delete|reorder`, `server:member:roles`, `server:permissions:invalidate` (o app relê canais, cargos e membros), `server:removed` (`reason`: `leave`, `kick` ou `ban`). `message:create/delete`, `channel:create/update` e `call:*` de canais só chegam a quem vê o canal.
