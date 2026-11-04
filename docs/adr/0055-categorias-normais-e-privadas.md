# 0055. Categorias como no Discord: padrões viram categorias reais, canais soltos numa lista só e categoria privada copiada nos canais

- Status: aceito
- Data: 2026-11-04
- Relacionado: [0052](0052-arrastar-canais-e-categorias.md), `docs/CARGOS.md`

## Contexto

"Canais de texto" e "Canais de voz" eram seções fixas: canal sem categoria caía numa
delas pelo tipo, e não dava para renomear, mover nem excluir. O dono pediu o modelo do
Discord: as duas viram categorias como as outras, canal pode ficar solto no topo
(texto e voz numa lista só), e categoria pode ser privada, levando os canais junto.

Três coisas decidem o desenho: **vazar é o pior erro**, porque categoria privada tem de
valer em lista, busca, menção, chamada, notificação e WebSocket; **apps antigos** (o
Android demora a atualizar) leem `channels.position` por tipo e as sobrescritas do canal;
e **o cálculo de permissões** já é o ponto único por onde tudo isso passa
(`permission.Snapshot`).

## Opções consideradas

Como o canal segue a categoria:

1. **Herdar na leitura**: o canal vinculado não guarda regras, e o snapshot usa as da
   categoria. Sem cópia, mas apps antigos editando o canal precisariam de copiar-ao-editar,
   e sair da categoria abriria o canal, a menos que se copiasse naquele momento.
2. **Copiar no canal e bloquear pela categoria**: as regras ficam também no canal (como o
   Discord guarda); "vinculado" é ter as mesmas regras da categoria, sem coluna para
   manter em dia. O snapshot ainda confere a categoria, para canal de permissão própria
   não abrir para quem não a vê.
3. **Só copiar, sem bloqueio** (o Discord): canal dessincronizado pode ficar aberto dentro
   de categoria privada. Vai contra o pedido: quem não vê a categoria não vê os canais dela.

Onde guardar a ordem dos soltos, única entre texto e voz:

1. **Mudar `channels.position` para ser global**: quebra o app antigo, que ordena por tipo.
2. **Usar `channel_category_layout`, que já existe**: a linha sem categoria é o canal solto.
   `channels.position` continua por tipo para os apps antigos.

## Decisão

**Permissões: opção 2.** Tabela `category_overwrites`, regras copiadas nos canais
vinculados na mesma transação, e `Snapshot.Channel` zera o canal de quem não vê a
categoria. Como tudo passa pelo snapshot, a busca, a chamada, o push e o Hub não mudaram.
O bloqueio entrou em `testdata/vectors.json` (`category_gate`).

**Regra de ouro: mover nunca abre.** Canal público ou vinculado que entra numa categoria
herda dela, mas privado que vai para categoria aberta (ou fica solto) continua privado e
aparece como dessincronizado: abrir é o "Sincronizar", que é explícito e exige *Gerenciar
cargos*. Isso difere do Discord, onde arrastar um vinculado para categoria aberta abre o
canal sem aviso.

**Sair da categoria** (mover ou excluí-la): a restrição dela passa para o canal de
permissão própria (`permission.SealOverwrites`). Pode tirar acesso de alguém que via;
nunca dá acesso a mais. Um teste com 5000 combinações aleatórias garante isso, e foi ele
que achou o caso em que o "liberar" de um cargo vencia o "negar" vindo da categoria.

**Ordem dos soltos: opção 2.** A rota antiga `PUT /channels/order` continua e leva a ordem
nova para a lista única sem invadir o lugar do outro tipo. O evento `channel:reorder`
passou a mandar a cada pessoa só os ids que ela vê.

**Migration de dados (000194)**: cria as duas categorias só com canal daquele tipo solto
ou servidor sem nenhuma categoria, no topo e na ordem em que as seções estavam. **Já existe
categoria com esse nome** (sem diferenciar maiúsculas, a de menor posição): ela recebe os
canais soltos, antes dos que já tinha, e vai para o topo. Duas seções com o mesmo título
na tela viram uma; é a única mudança visível da migration.

**Servidor novo**: o hook de criação do canal do Maestro, o último a nascer, cria as duas
categorias e coloca os canais nelas. Se isso falhar, o servidor funciona com os canais
soltos (fica no log).

**Ocultar canais silenciados**: preferência local, por conta e servidor, como as
categorias recolhidas. Conta só o silêncio do próprio canal: com o servidor silenciado, a
lista não pode ficar vazia.

Nativo (Rust): sem ganho; é regra de permissão no backend e DOM no renderer.

## Consequências

- Sem dependência nova. Uma migration com up e down; o down mantém fechado quem a
  categoria negava.
- O app antigo vê as categorias novas como qualquer categoria, e o Android antigo continua
  listando por tipo, com a privacidade garantida pelo servidor.
- Editar a categoria reescreve as regras de cada canal vinculado: é uma escrita por canal,
  sob a mesma trava da organização, numa operação rara.
- Canal de sistema não tem regras próprias: dentro de categoria privada fica escondido, e
  ao sair dela volta a valer para todos, inclusive o histórico.
- `channel:delete` continua indo para a sala do servidor inteira com o id do canal apagado
  (o canal já não existe no snapshot para filtrar). É só um id aleatório, sem nome.
- Pendências: edição de categorias no Android; a preferência de ocultar não acompanha a
  pessoa entre aparelhos; `serverStore.reorderChannels` e a rota antiga ficam até os apps
  antigos saírem de circulação.
