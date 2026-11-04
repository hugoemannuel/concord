# 0051. Guardar o perfil por servidor só com o que foi sobrescrito, com o apelido como nome e o escopo por contexto no app

- Status: aceito
- Data: 2026-11-03

## Contexto

Issue #529: cada pessoa pode ter um perfil diferente em cada servidor; sem nada
configurado, continua o global. As forças:

- **Sem perfil de servidor nada muda** para ninguém, inclusive apps antigos.
- Listas pesadas (membros, mensagens) já trazem nome e avatar em lote: sem N+1.
- O perfil aparece em dezenas de componentes, a maioria só com `userId`.
- O apelido (`server_members.nickname`) já é "o nome neste servidor", resolvido
  em todo lugar, com `CHANGE_NICKNAME`, `MANAGE_NICKNAMES` e auditoria.
- A linha pode sumir por muitos caminhos (sair, expulsar, banir, apagar conta ou
  servidor), e os arquivos têm de sair junto, sem apagar o que outro usa (ADR 0011).
- Outros agentes mexem em `internal/server` e `features/servers` ao mesmo tempo.

## Opções consideradas

**Onde mora o nome**

1. Coluna própria de nome no perfil do servidor: dois "nomes neste servidor", e
   quem perdeu `CHANGE_NICKNAME` escaparia de um apelido imposto pela moderação.
2. **O nome é o apelido.** Tudo o que já resolve apelido continua valendo.

**Guardar**

1. Cópia inteira do perfil por servidor: simples de ler, mas o global deixa de
   valer assim que existe uma linha, e não há "herda" por campo.
2. **Só os campos sobrescritos, NULL = herda.** Permite "Voltar ao padrão" por
   campo; texto vazio é valor (esconde o Sobre mim só ali). É o modelo do Discord:
   o membro tem avatar, banner e bio próprios e o cliente cai no do usuário quando
   são nulos.

**Resolver no app**

1. Passar `serverId` por prop até cada avatar e nome: dezenas de arquivos tocados,
   e é fácil esquecer um e misturar perfis.
2. Chave do `profileStore` por (servidor, pessoa): obriga todo leitor a saber o
   servidor, e o `user:update` teria de varrer as chaves.
3. **Contexto React (`ProfileScope`) mais um store próprio** por cima do
   `profileStore`, que continua global. Fora do provider o padrão é null: o global
   é o que sobra por construção, sem precisar lembrar de nada em DM e amigos.

**Limpar os arquivos**

1. Ganchos antes de cada remoção (moderação, sair, apagar servidor, apagar conta):
   vários pontos para lembrar, e `server/service.go` já é grande.
2. **Caixa de saída gravada por gatilho na mesma transação do DELETE**, esvaziada
   depois pelo backend: vale para todo caminho, inclusive cascata. É o padrão
   outbox aplicado a arquivos.

## Decisão

- Domínio `internal/memberprofile`, tabela `server_member_profiles` com FK para
  `server_members` (ON DELETE CASCADE): sair do servidor leva o perfil, e voltar
  começa do zero. Sem campo sobrando, a linha é apagada.
- Rotas em `/servers/:id/my-profile`. `/servers/:id/profile` e o nome `serverprofile`
  são do perfil **do servidor** (ADR 0050, #528); aqui é o perfil **do membro no
  servidor**, por isso `memberprofile` no backend e `memberProfiles` no app.
- PATCH com três estados: campo ausente não muda, `null` volta ao padrão, valor
  sobrescreve. A mídia usa o upload do perfil global (`UploadImage`).
- `ListMembers`, `FindMemberByUserID` e as consultas de mensagens fazem LEFT JOIN
  na mesma consulta: avatar, estilo e faixa saem já efetivos (por isso o app mobile
  e os apps antigos recebem o perfil do servidor sem mudar nada) e os membros trazem
  `member_profile` só quando existe.
- Tempo real pelo `server:member:update` que já existe, com o membro relido.
- Arquivos por referência (ADR 0011): `user.MediaKeepers` junta perfis salvos e
  perfis de servidor em "alguém ainda usa?". A varredura roda a cada 10 minutos e ao
  apagar um perfil.

**O que cada permissão controla:** ser membro basta para editar o próprio perfil no
servidor. `CHANGE_NICKNAME` controla só o nome: sem ela, o campo fica travado e o
resto funciona. `MANAGE_NICKNAMES` continua trocando o apelido dos outros. Editar o
perfil do servidor de outra pessoa não existe (o id vem da sessão).

## Consequências

- Componentes novos dentro de um servidor recebem o perfil certo sem fazer nada;
  quem desenha fora do provider e quer o perfil do servidor precisa de um
  `ProfileScope` (o cartão e a barra lateral têm o próprio, por estarem fora do
  `ServerView`).
- A janela do overlay não tem contexto: recebe as URLs resolvidas
  (`withMemberProfiles`).
- "Remover" no perfil de servidor é voltar ao padrão: não dá para ficar sem avatar,
  sem banner ou sem cor só num servidor. A faixa pode ser escondida (modo `off`), e
  pronomes, nota, Sobre mim e links podem ficar vazios.
- Faixa efetiva que depende do global: se a pessoa muda o modo global da faixa
  depois de pôr um banner no servidor, os outros só veem ao recarregar a lista.
- Um arquivo pode ficar órfão se o processo cair entre esvaziar a caixa e apagá-lo:
  mesma troca do ADR 0011 (melhor sobrar arquivo do que quebrar um perfil).

**Pendências:** edição no app mobile (ele só mostra o que a API já resolve);
aplicar um perfil salvo num servidor (os perfis salvos continuam globais; faz
sentido e a mídia por referência já suporta, mas o salvo guarda o perfil inteiro e
precisaria decidir o que vira sobrescrita); moderação do perfil de servidor alheio
(hoje a saída é expulsar); som de entrada e status por servidor ficaram de fora de
propósito (são da pessoa, não do visual).

## Fontes

- Perfil por servidor no Discord (campos no membro e na edição de `members/@me`,
  queda no valor do usuário feita pelo cliente). A busca não trouxe a documentação
  oficial; estas são fontes secundárias:
  [Discord.Net](https://docs.discordnet.dev/api/Discord.SelfGuildUserProperties.html),
  [erin.js](https://erin.js.org/v/latest/api/classes/GuildMember.html),
  [discordgo #1117](https://github-redirect.dependabot.com/bwmarrin/discordgo/pull/1117/).
- Outbox: [AWS Prescriptive Guidance](https://docs.aws.amazon.com/en_en/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html).
- Padrão do repo: ADR 0011, `user.ProfileHandler.UploadImage` e `RemoveMediaURL`,
  apelido em `internal/server/nickname.go`.
