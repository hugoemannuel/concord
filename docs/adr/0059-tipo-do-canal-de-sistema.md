# 0059. Tipo do canal de sistema em coluna própria

- Status: aceito
- Data: 2026-11-06

## Contexto

O servidor tem dois canais de sistema: o #musica do Maestro e o #avisos. Até aqui eles eram
reconhecidos pelo nome junto com `is_system`: o backend procurava `musica`/`musica-maestro` e
`avisos`/`avisos-sistema` (com o literal `"avisos-sistema"` solto no repositório) e o app repetia a
lista `['musica', 'musica-maestro']`. Cada renomeação (migration 000116) ou nome alternativo
precisava ser lembrado em três lugares, e um canal de sistema novo exigiria mais uma lista.

## Opções consideradas

1. **Manter o nome como chave.** Nada a migrar, mas a regra fica espalhada e frágil.
2. **Coluna `system_kind` em `channels` (escolhida).** `'maestro'`, `'notices'` ou NULL; o
   backfill segue a regra de nome que valia, e dali em diante só o tipo decide.
3. **Guardar os ids dos canais de sistema em `servers`.** Duas colunas novas que precisariam
   acompanhar cada canal de sistema que surgir, e o JSON do canal não diria o que ele é.

## Decisão

- Migration 000197 cria `channels.system_kind` (CHECK `maestro`/`notices`, NULL nos demais) e
  preenche os canais existentes pela regra antiga de nome.
- `CreateSystem`/`CreateNotices` gravam o tipo; `Create` (pedido do cliente) zera o tipo junto com
  `is_system`. `FindSystemByServerID`, `FindNoticesByServerID` e `MaestroChannels` consultam pelo
  tipo.
- O JSON do canal leva `system_kind`; o app reconhece o #musica por `system_kind === 'maestro'`.
- `is_system` continua sendo o que trava editar e remover.

## Consequências

- O nome dos canais de sistema deixa de importar para o código; os nomes só valem na criação.
- Canal de sistema novo = um valor novo no CHECK e uma constante, sem lista de nomes.
