# Ligar para quem está em call (estilo Discord)

## Intenção

Hoje, ligar (DM 1:1) para alguém que está em outra chamada não chama a pessoa: quem liga recebe na
hora o toast "O usuário está ocupado em outra chamada." e a ligação morre. Quem já está numa call
também não consegue ligar (o botão do cabeçalho da DM fica desligado).

O usuário quer o comportamento do Discord: uma conta tem **uma conexão de voz só**, e entrar em outra
chamada tira você da anterior, sem pedir confirmação. Então:

1. **Quem recebe:** a chamada toca (modal + toque) mesmo com a pessoa numa call. Atender tira ela da
   call atual e coloca na DM. Recusar ou ignorar não muda nada na call dela.
2. **Quem liga:** pode ligar estando numa call; ligar tira da call atual e começa a DM tocando.

## Metas

- O chamado em outra call (canal de voz, DM, grupo) recebe o convite e pode atender.
- Atender troca de call numa operação só no servidor.
- Quem está numa call pode ligar; o servidor tira da call antiga e cria a DM.
- Desktop e app Android com o mesmo comportamento.

## Fora do escopo

- DM que continua viva sem ninguém atender, com aviso "chamada em andamento" e botão de entrar na
  conversa (como no Discord). Fica para um PR separado (custa mais ou menos o dobro: estado novo, restore,
  aviso no desktop e no app).
- Mais de uma chamada tocando ao mesmo tempo para a mesma pessoa.
- Confirmação "Trocar de chamada?". O Discord não pede; nós também não.

## Anti-metas

- A pessoa ficar sem call nenhuma porque a troca falhou no meio (saiu da antiga e a nova não existia mais).
- A call antiga continuar mostrando a pessoa (lista do canal de voz, tiles) depois da troca.
- Mídia da call antiga continuar ligada no cliente depois da troca (áudio de duas salas).

## Restrições

- `call/service.go` é god service: nada de método novo nele (AGENTS.md, regra 2). O código novo vai em
  arquivo próprio do pacote `call` (ex.: `switch.go`).
- `callStore` (desktop, 1950 linhas) é god store: sem campo novo. O arquivo tem que sair do PR **menor**.
  A chamada recebida sai dele para um `incomingCallStore` próprio (o mobile já tem um).
- CRAP ≤ 15 em toda função tocada; TDD; sem dependência nova.
- Sem texto novo para o usuário final (os textos que somem: o toast de ocupado no caso comum e o título
  "Você já está em uma chamada" do botão). Se aparecer texto novo, precisa de aprovação.

## Abordagens consideradas

| | Como | Troca |
|---|---|---|
| **A. Servidor troca (escolhida)** | `StartDM` e `Accept` tiram a pessoa da call antiga e colocam na nova; os apps só reagem | Sem janela de "sem call" por pedido falho; desktop e mobile ganham a regra de graça. Mexe no núcleo das calls no servidor |
| B. App troca | Servidor só para de recusar o convite; o app faz "sair" e depois "atender/ligar" (como a troca de canal no desktop) | Servidor muda pouco, mas a lógica fica duplicada em desktop e mobile, e um segundo pedido falho deixa a pessoa sem call |
| C. Misto | Servidor troca ao atender; app troca ao ligar | Duas regras diferentes para a mesma ideia |

O usuário escolheu **A**.

## Como funciona (decidido)

### Servidor (`backend/internal/call`)

**Convite (`reserveDMLocked`, `dm_start.go`)**
- Chamado em outra call **não** é mais `ErrBusy`: a DM é criada tocando e o `call:invite` vai para ele
  normalmente (o `call:invite` já é por usuário, não depende de sala).
- Quem liga em outra call (que não é a DM desta conversa): sai dela antes de criar a DM (ver "Troca").
  O caso "já estou na DM desta conversa" continua devolvendo a chamada existente.
- Chamado **já tocando** para outra DM (é `inviteeID` de outra chamada tocando): continua `ErrBusy`
  (o toast atual aparece só nesse caso raro). *Escolha minha:* evita duas chamadas tocando.

**Atender (`Accept`, `dm_answer.go`)**
- Chamado em outra call: valida primeiro a chamada nova (existe, não terminou, ele é o convidado) e só
  então sai da antiga e entra na nova. Se a nova já acabou, devolve `ErrNotFound` **sem** tirar ele da antiga.

**Troca (função nova num arquivo novo, ex. `switch.go`)**
- `leaveCurrentForSwitch(ctx, userID, exceptCallID)`: se `busy[userID]` aponta para outra call,
  tira o usuário da sala WS dela (`leaveCallRoom`, como no `move.go`, para o próprio cliente não receber
  o `call:left`/`call:ended` dela fora de ordem) e chama `Leave`. Quem fica na call antiga vê o `call:left`
  normal (lista do canal de voz, tiles); DM 1:1 antiga termina para a outra pessoa com o aviso normal
  "X saiu da chamada."
- A janela entre validar e trocar (outra goroutine encerra a chamada nova nesse meio-tempo) é aceita:
  o pior caso é a pessoa sair da antiga e o `Accept` devolver `ErrNotFound` (o cliente volta a ocioso).
- Castigo: a restrição `NoConnect` vale para **entrar** em call de servidor; sair de uma não é bloqueado.
  DM não tem servidor, então o castigo não impede atender nem ligar (comportamento atual mantido).

### Desktop (`frontend/src/renderer/src/features/call`)

- **`incomingCallStore` novo** (Zustand, um store por responsabilidade): `{ call: { callId, conversationId,
  initiator } | null, ring(), clear() }`, no espelho do mobile. O `call:invite` passa a ir para ele
  mesmo com a pessoa numa call; sai do `callStore` o status `ringing` e o que só servia a ele.
- **`IncomingCallModal`** lê do `incomingCallStore`; toque igual ao de hoje. Funciona de 360 px a telas
  largas, com teclado (foco no Atender, Esc recusa) e toque.
- **Atender:** se está numa call, faz a limpeza **local** da antiga (desliga mídia, sai da sala WS),
  sem mandar "sair" ao servidor (o servidor já tira no `Accept`); depois o fluxo atual de aceite.
- **Ligar:** o botão do cabeçalho da DM (`dmCallButton`) não fica mais desligado por estar em call.
  `startDMCall` faz a mesma limpeza local da call atual antes de chamar o servidor.
- `call:ended`/`call:decline` da chamada que toca limpam o `incomingCallStore`.
- `call:busy`: o toast continua, só para o caso raro (chamado já tocando).

### Mobile (`mobile/src/features/call`)

- `onInvite` (`callEvents.ts`) para de ignorar o convite quando `phase !== 'idle'`; a
  `IncomingCallScreen` aparece por cima da call atual.
- `acceptIncoming` e `callDm` já chamam `leave()` antes. Com o servidor trocando, esse `leave()` sobra
  (o servidor já tira). *Escolha minha:* manter, porque é inofensivo (o servidor responde "nada a fazer"
  quando a pessoa já saiu) e mantém o diff pequeno. O construtor pode trocar por limpeza local, se ficar
  mais simples.
- `callInviteTap.ts` (toque na notificação) também para de ignorar quando está numa call.

## Testes que importam

- Servidor: ligar para quem está em canal de voz → convite sai, ninguém sai de nada até atender;
  atender → sai do canal (com `call:left` para quem fica) e entra na DM; atender chamada já encerrada →
  não sai da call antiga; quem liga estando num canal sai dele; chamado já tocando para outra DM → `ErrBusy`;
  DM 1:1 antiga termina para a outra pessoa.
- Desktop: convite chega com call ativa → modal aparece e a call segue; aceitar → mídia antiga
  desliga e a nova conecta; recusar → call atual intacta; botão de ligar habilitado em call.
- Mobile: `onInvite` com fase ativa toca; aceitar/recusar mantêm o comportamento.

## Deixado para quem constrói

- Nome e local exato dos arquivos novos (dentro de `internal/call/` e `features/call/`).
- Como dividir a limpeza local do `callStore` desktop sem crescer o arquivo.
- Se o `incomingCallStore` desktop reaproveita algo do mobile (lógica pura portada por cópia adaptada).
