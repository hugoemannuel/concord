# 0058. Sons de todos os servidores da pessoa na mesa de áudio

- Status: aceito
- Data: 2026-11-05
- Complementa: [0013](0013-mesa-de-audio-por-servidor.md), [0054](0054-emojis-de-outros-servidores.md)

## Contexto

A mesa de áudio de uma chamada mostrava só os sons do servidor dela e os favoritos da pessoa. O
pedido é que funcione como as figurinhas e os emojis: ver os sons de todos os servidores de que a
pessoa é membro, com o trilho de servidores à esquerda, e tocar qualquer um deles na chamada.

Forças:

- O backend decide o que toca (`call.TriggerSoundboard`); hoje aceita o som do servidor da chamada
  ou um favorito de quem toca.
- O arquivo do som já é entregue a qualquer pessoa logada (ADR 0013), então quem ouve não precisa
  ser da origem. Não falta nada do lado de quem ouve.
- Os bits de permissão acabaram (ADR 0054): não há como criar um "Usar sons externos" separado,
  como o `USE_EXTERNAL_SOUNDS` do Discord, sem migrar as permissões para BigInt.

## Opções consideradas

1. **Exigir uma permissão no destino, reaproveitando `USE_EXTERNAL_EMOJIS`.** Dá controle ao dono,
   mas mistura "emojis" com "sons" num nome que não diz isso, e o favorito de fora já toca sem
   permissão nenhuma, então a regra ficaria incoerente.
2. **Criar `USE_EXTERNAL_SOUNDS`.** Igual ao Discord, mas não há bit livre (ver ADR 0054).
3. **Basta ser membro do servidor do som (escolhida).** A mesma regra que já vale para favoritar
   (ADR 0013) e para usar emoji e figurinha em DM. O "Usar mesa de áudio" do canal da chamada
   continua sendo conferido como antes.

## Decisão

- `GET /soundboard` devolve, numa consulta só, os sons de todos os servidores da pessoa agrupados
  por servidor (como `GET /stickers`).
- Na chamada toca: o som do servidor dela, um favorito de quem toca ou um som de servidor de que
  quem toca é membro. O mudo, o intervalo mínimo e o `USE_SOUNDBOARD` do canal não mudam.
- O app monta a mesa com a mesma casca do seletor de figurinhas (`ExpressionPicker`): trilho,
  favoritos primeiro, uma seção por servidor com o da chamada antes dos outros. Atalho de teclado
  vale para som de qualquer servidor carregado.
- Apagar continua: o que a pessoa enviou, em qualquer servidor; o dos outros, só no servidor da
  chamada e com "Gerenciar expressões".

## Consequências

- Boas: nenhuma permissão, tabela ou dependência nova; uma regra só para som de fora (ser membro).
- Ruins: o dono não consegue proibir sons de outros servidores nas chamadas dele (só tirar o "Usar
  mesa de áudio"). Quando as permissões forem para BigInt, `USE_EXTERNAL_SOUNDS` entra aqui.
- Visitante na chamada só vê os sons dos servidores de que é membro e os do servidor da visita.
