# 0036. Registro de auditoria do servidor com gravação central depois da ação

- Status: aceito
- Data: 2026-10-31

## Contexto
A issue #343 pede o registro de auditoria do servidor, como no Discord: quem
fez cada ação de moderação ou administração, em quem/onde, quando e o que
mudou (antes → depois), visível só para o dono e para quem tem a permissão
nova **Ver registro de auditoria**. Forças: as ações estão espalhadas por
uns dez domínios (server, role, channel, call, message, emoji, sticker,
soundboard, event, guest); parte delas mexe só em memória e no LiveKit (voz),
sem transação; falhar ao registrar não pode quebrar a ação; o registro nunca
guarda senha, token, código de convite nem conteúdo de mensagem; leitura
paginada e filtrável por autor e por ação; e cada domínio tem que continuar
testável sem banco.

## Opções consideradas
1. **Gravar na mesma transação da mudança** (o rascunho do PR #345): o
   registro nunca diverge do banco, mas cada repositório passa a abrir
   transação e conhecer a tabela de auditoria (SQL espalhado, dezenas de
   assinaturas trocadas), a voz fica de fora (não há transação) e uma falha no
   registro desfaz a ação, o oposto do pedido. Descartada.
2. **Outbox/eventos de domínio** (cada domínio publica um evento e um
   consumidor grava): desacopla bem, mas o repo não tem barramento de eventos
   de domínio (o Hub do WebSocket é para o app e não leva quem fez nem o
   "antes"); seria infraestrutura nova para um único consumidor. Descartada
   (YAGNI).
3. **Gravação central depois da ação** (escolhida): o pacote
   `internal/audit` tem o único SQL da tabela `server_audit_log` e um
   `Recorder.Record(ctx, audit.Event)` que não devolve erro (falha vai para o
   log). Cada domínio declara a interface pequena `AuditRecorder` que usa e
   chama `Record` logo depois que a ação deu certo, onde já conhece o ator e o
   "antes" (service quando ele recebe o ator; handler quando a checagem e o
   estado anterior estão lá, como canais e configurações do servidor). A
   ligação é em `cmd/` (`SetAudit`), como os outros ganchos do repo.

## Decisão
Opção 3. Detalhes:
- A gravação ignora o cancelamento do pedido (`context.WithoutCancel` + 5 s):
  a ação já aconteceu e o registro não se perde porque o cliente fechou.
- Nomes: quem chama manda só ids quando não tem o nome à mão; o `INSERT`
  resolve o nome atual de membro, canal e cargo e o guarda (o alvo pode ser
  apagado depois). Na leitura, o nome e o avatar de quem fez e o nome de
  membro-alvo vêm de `users` (sempre atuais).
- O que entra: servidor (nome, ícone, canal principal), Maestro removido ou
  readicionado, convite direto, novo link de convite, convites de visitante
  (criar, revogar) e visitante expulso; canais (criar, editar, apagar,
  reordenar, permissões por cargo/membro); cargos (criar, editar, apagar,
  reordenar, dar e tirar de membro); membros (entrou, saiu, expulso, banido
  com motivo, desbanido, apelido trocado por outra pessoa); voz (silenciar,
  ensurdecer, mover, desconectar); mensagens (apagada por moderador, fixar,
  desafixar); emojis, figurinhas e sons (adicionar, remover); eventos (criar,
  editar, cancelar, acesso dos cargos). Edição sem mudança não grava. O
  próprio apelido e apagar a própria mensagem não entram (não são moderação).
- Leitura: `GET /servers/:id/audit-log?actor_id=&action=&before=&limit=`,
  do mais recente para o mais antigo, cursor pelo id (50 por página, até
  100). Exige `VIEW_AUDIT_LOG` (bit `1<<14`, fora do @everyone; dono e
  Administrador têm). Servidor de outro responde 403 `not_member` sem tocar
  no banco.
- Retenção: 90 dias, limpos no boot e uma vez por dia (`audit.Retention`). O
  Discord guarda 45; 90 dá mais tempo para investigar e o volume é pequeno
  (uma linha por ação administrativa).
- Tempo real ficou de fora: a tela recarrega ao abrir e ao trocar o filtro.

## Consequências
- Ação nova de moderação = uma constante em `audit/model.go`, a chamada no
  domínio e a frase em `features/auditlog/lib/auditActions.ts` (o teste do
  catálogo cobra a frase e o grupo do filtro).
- Uma queda do banco entre a ação e o registro perde a linha (fica no log do
  servidor). Aceito: o registro é para consulta, não para conformidade.
- Ações feitas antes desta versão não aparecem.

## Fontes
- Discord, Audit Logs (entradas, ações, 45 dias, VIEW_AUDIT_LOG): https://docs.discord.com/developers/resources/audit-log
- Microsoft, Transactional Outbox pattern: https://learn.microsoft.com/en-us/azure/architecture/databases/guide/transactional-outbox-cosmos
- OWASP Logging Cheat Sheet (o que não registrar: segredos, tokens): https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
