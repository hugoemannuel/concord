# 0052. Arrastar canais e categorias com eventos de ponteiro e gravar a organização numa rota atômica com revisão

- Status: aceito
- Data: 2026-11-03

## Contexto

A issue #527 pede para organizar à vontade a barra de canais: arrastar uma
categoria inteira com os canais dela, levar um canal para outra categoria, para
fora de qualquer categoria, para uma categoria vazia ou recolhida. Com mouse e
com toque (segurar para arrastar), de 360 px a telas largas. A barra tinha o
arrastar nativo do navegador (`draggable`, HTML5), só para canais e sem
categoria arrastável, e duas rotas que mudavam uma coisa por vez, sem autoria na
auditoria nem proteção contra duas pessoas mexendo juntas.

## Opções consideradas

Gesto:

1. **Arrastar nativo (HTML5), o padrão do repo** (`useServerRailDrag`): não
   funciona no toque, não deixa desenhar o fantasma com os canais da categoria e
   não dá controle sobre a rolagem automática.
2. **Biblioteca (`dnd-kit` ou parecida)**: resolve tudo, mas é dependência nova e
   desenhada para listas reordenadas com animação; aqui o alvo tem regras
   próprias (seções por tipo, categoria recolhida, canais ocultos).
3. **Eventos de ponteiro, sem dependência**: um gesto só para mouse e toque, com
   fantasma próprio e alvo descoberto por `elementFromPoint`, como faz o modo de
   toque do Sortable.

Gravação:

1. **Só as rotas de um passo** (`moveChannel`, `moveCategory`): não há rota que
   registre a mudança como uma coisa só, e cada mudança otimista precisaria virar
   uma sequência de passos.
2. **Lista inteira, última gravação vence**: simples, mas quem grava por último
   desfaz em silêncio o que a outra pessoa acabou de fazer.
3. **Lista inteira com revisão**: o cliente devolve a revisão que leu; dentro da
   transação, com o servidor travado, a revisão é recalculada e, se mudou, o
   pedido volta com 409.

## Decisão

**Gesto: opção 3.** O gesto fica em `lib/sidebarDragGesture.ts` (sem React, testado
com eventos falsos), as regras de alvo em `lib/sidebarDrop.ts` e a árvore em
`lib/channelLayoutTree.ts`; `hooks/useSidebarDrag.ts` só liga as partes. O arrastar
nativo da barra de canais saiu (`lib/channelDrop.ts`, `hooks/useChannelReorder.ts`),
inclusive em servidor sem categorias, que passa a ter toque também e continua
gravando pela rota antiga por tipo. O arrastar nativo de pessoas entre canais de
voz não mudou.

**Gravação: opção 3**, em `PUT /servers/:id/categories/layout`, no pacote
`internal/channelcategory`. A revisão é um hash calculado na hora do que o membro
vê: não precisa de migration e nenhuma rota precisa se lembrar de atualizá-la.
Canal que o membro não vê não entra no pedido e fica no índice que tinha, então
ninguém move, apaga da categoria ou descobre um canal oculto.

Nativo (Rust): sem ganho aqui; é interação de DOM dentro do renderer.

## Consequências

- Sem dependência nova e sem migration.
- Duas pessoas organizando ao mesmo tempo: a segunda recebe a lista nova e um aviso
  para tentar de novo, em vez de desfazer a primeira. O evento `category:changed`
  mantém a janela de conflito curta.
- Mudança vira uma linha `channel.reorder` com `type = layout` na auditoria.
- As rotas `PUT /categories/:id/order` e `PUT /categories/channels/:id` ficam para os
  apps ainda não atualizados. O app atual não as usa; podem sair numa próxima versão.
- O código do gesto é nosso para manter (toque longo, rolagem, clique engolido).
  Foi conferido no Chromium, com mouse e com toque de verdade pelo protocolo do
  navegador; não foi conferido em Safari/iOS.
