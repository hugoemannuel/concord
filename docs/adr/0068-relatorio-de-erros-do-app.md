# 0068. Relatório de erros do app: grupos por impressão digital e pilha traduzida no servidor

- Status: aceito
- Data: 2026-11-25
- Complementa: [0029](0029-observabilidade-das-lives.md) (mesma família `/api/obs/`, mesmo acesso de dev, mesma retenção)

## Contexto

Um erro no app hoje fica no `console.error` do aparelho (`AppErrorScreen`,
`ErrorBoundary` do Android) ou no journal (panic do backend). Os devs só sabem
quando alguém reclama. O dono pediu um relatório de erros reaproveitando o canal
da telemetria, com versão e sistema, e uma lista no painel dos devs.

Forças:

- **Privacidade**: mensagem e pilha carregam texto digitado, caminho do usuário
  (`C:\Users\<nome>`), URL com token ou id. Precisa sair limpo do aparelho.
- **VPS pequena**: um laço de erro (render que quebra a cada quadro) não pode
  virar milhões de linhas nem derrubar o servidor.
- **Leitura útil**: "este erro aconteceu 40 vezes com 6 pessoas", não 40 linhas;
  outro agente (obs-alertas) vai ler "grupo novo desde X" e "pessoas afetadas por
  grupo numa janela".
- **Pilha do bundle**: em produção o renderer web sai minificado
  (`index-abc123.js:1:23456`); o do desktop não é minificado (electron-vite 5 usa
  `minify: false`), mas aponta para o bundle, não para o arquivo do código.
  Sem dependência nova e sem publicar o código-fonte.
- O processo main do Electron não tem login; o backend não tem conta no panic.

## Opções consideradas

### Agrupamento

1. **Só ocorrências, agrupadas na leitura** (`GROUP BY fingerprint`): uma tabela,
   mas cada ocorrência guarda a pilha inteira e a leitura recalcula tudo.
2. **Grupos + ocorrências por hora** (o que o Sentry chama de *issue* + *event*,
   com a impressão digital por tipo + mensagem normalizada + quadros): a pilha
   fica uma vez no grupo; a ocorrência é uma linha por (grupo, pessoa, hora,
   versão) com a contagem somada no `ON CONFLICT`. Teto natural de linhas.
3. Seguir o padrão da telemetria (sessão + amostras): não serve, erro não tem sessão.

### Pilha minificada

1. **Source maps "hidden" guardados no servidor, fora da pasta pública, com a
   tradução feita no backend ao ler** (o caminho do Sentry/Bugsnag, sem o serviço
   deles). O Vite gera `.map` sem o comentário `sourceMappingURL`; um plugin do
   build tira os `.map` da saída (não vão no instalador nem no `dist-web`) para
   `frontend/sourcemaps/`; o deploy manda essa pasta para
   `/opt/concord/sourcemaps/`; o backend decodifica o VLQ (ECMA-426, ~80 linhas
   de Go) quando um dev abre o grupo.
2. **Script de dev que traduz a partir do artefato do release**: zero mudança no
   deploy, mas o painel mostra a pilha crua e o dev precisa do build exato na mão.
3. **Publicar o `.map` junto do bundle** (DevTools traduz sozinho): expõe o
   código-fonte para qualquer um. Descartado.

## Decisão

- **Grupos + ocorrências por hora** (opção 2 do agrupamento). Impressão digital
  calculada **no servidor** (o cliente não é confiável): `sha256(origem + tipo +
  mensagem normalizada + 3 primeiros quadros normalizados)`, normalização = números
  viram `N`, ids e tokens viram marcadores, quadro reduzido ao nome do arquivo e
  à função (sem linha e coluna, que mudam a cada build).
- **Source maps hidden no servidor** (opção 1 da pilha). Fica traduzido: a pilha do
  **renderer** (web minificado e desktop, este para o arquivo do código) cujos `.map` estejam em `SOURCEMAPS_DIR`. Não fica:
  o **main do Electron** (o bundle do main não é minificado: nomes e linhas do
  `out/main/index.js` já se leem), o **Android** (Hermes gera bytecode; traduzir
  exigiria o `.map` composto do Metro + Hermes de cada APK, fica para depois) e o
  **backend** (a pilha do Go já vem com arquivo e linha). Pilha sem `.map` aparece
  crua, sem erro.
- **Limpeza duas vezes**: no aparelho, antes de sair (query string, fragmento,
  tokens, JWT, e-mail, UUID, caminhos de usuário, textos entre aspas longos), e de
  novo no servidor com as mesmas regras (defesa se um cliente antigo ou adulterado
  mandar sujo). Nada de props, estado ou `componentStack`.
- **Erros de rede esperados não vão** (fetch que falhou, `AbortError`, offline,
  `ApiError` da nossa API, chunk que não baixou): não são bug do app; o 5xx da API
  já é visto pelo lado do servidor (panic → este relatório; erro → journal). Também
  não vão `ResizeObserver loop` (aviso benigno do navegador) e erros cuja pilha
  começa numa extensão do navegador (`chrome-extension://`, `moz-extension://`).
- **Main do Electron**: guarda em memória (até 20 grupos, com contagem) e repassa ao
  renderer pela ponte `window.api.errorReport`; o renderer manda com a conta dele.
  Erro antes da janela abrir espera nessa fila; queda do próprio main (nativa) se
  perde (exigiria o `crashReporter` com minidumps, fora do escopo).
- **Backend**: um gancho pequeno em `internal/platform/recovery` troca o
  `gin.Recovery()`: mesmo log e mesmo 500, mais uma lista de observadores
  `func(Panic)`. O `internal/apperrors` se registra como um; a tarefa obs-servidor
  (panics por minuto) pode se registrar como outro, sem conhecer este pacote. O
  observador só junta em memória; um laço grava de 10 em 10 s.

## Limites e volume

| Onde | Limite |
|---|---|
| Aparelho | dedup por chave (tipo + mensagem + 1º quadro), conta as repetições; envio a cada 30 s, até 10 erros por envio (≤ 20 por minuto); até 50 chaves por sessão do app, o resto é descartado |
| Servidor, pedido | login de conta (visitante não manda); corpo ≤ 32 KB; ≤ 10 erros; 6 pedidos/min por pessoa |
| Servidor, erros | 120 erros/hora por pessoa e 1200/hora no total; mensagem ≤ 300 B; pilha ≤ 30 quadros e 4 KB; contagem 1–10 000 |
| Backend | até 50 impressões digitais pendentes na memória, gravadas a cada 10 s |

Linhas: `app_error_groups` = 1 por erro distinto; `app_error_occurrences` = 1 por
(grupo, pessoa, hora, versão). Esperado (~50 pessoas ativas): dezenas por dia,
~1–3 mil em 14 dias. Teto: 1200 erros/hora no total = 28,8 mil linhas/dia, ~400
mil em 14 dias (~120 MB no pior caso, sustentado por 14 dias seguidos); o teto
por pessoa faz um aparelho em laço gastar só 120/hora. Retenção: 14 dias,
apagada de hora em hora pelo backend (ocorrência pela hora, grupo pela última vez).

## Consequências

- Mais fácil: o painel mostra grupos com pessoas afetadas; o obs-alertas lê
  `GroupsFirstSeenSince` e `AffectedByGroup` sem conhecer o resto.
- `first_seen` de um grupo recomeça se ele ficar 14 dias sem acontecer (volta como
  "novo"): aceitável.
- O deploy ganha uma pasta (`/opt/concord/sourcemaps`), com os `.map` com mais de
  90 dias apagados no próprio deploy. Variável nova `SOURCEMAPS_DIR` (padrão
  `/opt/concord/sourcemaps`; vazia ou ausente = sem tradução).
- Depois: traduzir a pilha do Hermes (Android) e ligar o `crashReporter` do Electron.

## Fontes

- Source Map Revision 3 / ECMA-426: https://tc39.es/ecma426/
- Vite, `build.sourcemap: 'hidden'`: https://vite.dev/config/build-options#build-sourcemap
- Sentry, agrupamento por impressão digital: https://docs.sentry.io/concepts/data-management/event-grouping/
- Sentry, source maps enviados ao servidor (não publicados): https://docs.sentry.io/platforms/javascript/sourcemaps/
- React Native, símbolos do Hermes em release: https://reactnative.dev/docs/debugging-release-builds
