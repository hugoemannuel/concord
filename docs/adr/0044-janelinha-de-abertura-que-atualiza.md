# 0044. Janelinha de abertura que atualiza antes de abrir o app desktop

- Status: aceito
- Data: 2026-11-01
- Complementa: [0028](0028-atualizacoes-pelo-github-releases.md)

## Contexto

O dono pediu uma abertura como a do Discord: ao abrir o app desktop, uma janela pequena com o
logo e o status ("Procurando atualizações…", "Baixando atualização… 42%", "Instalando…",
"Abrindo…"); com versão nova, o app **primeiro atualiza e depois abre**. Também ao iniciar com
o sistema (abre na bandeja): a janelinha aparece durante a checagem e some, deixando o app
minimizado.

Até aqui a versão nova era baixada em segundo plano com o app aberto e só instalava com clique
em "Atualizar" — ou sozinha, sem aviso, se a versão já estivesse verificada de uma sessão
anterior e o app tivesse aberto há menos de 30 s (`installOnStartup`), o que fechava a janela
principal recém-aberta.

Forças: a abertura nunca pode travar (sem rede, servidor fora, download parado); a verificação
da assinatura Ed25519 continua obrigatória; o fluxo com o app aberto (aviso e "Atualizar") não
muda; Windows (NSIS/electron-updater) e Linux (AppImage e `.tar.gz` com o updater próprio) pelo
mesmo caminho; sem dependência nova.

## Opções consideradas

1. **Processo/updater separado com a própria janela** (o Discord usa um "host" que atualiza o
   app antes de abri-lo). Exige um segundo executável, um instalador novo e outra assinatura;
   grande demais para o ganho.
2. **Janelinha nativa no helper Rust** (`native/`). Abriria alguns ms antes, mas só depois de o
   Electron subir para lançar o helper — não há ganho real de tempo; e a lógica de atualização
   (electron-updater, assinatura, updater do Linux) mora no main do Electron. Descartada pela
   regra "nativo só com ganho real".
3. **BrowserWindow pequena no próprio main, usando o updater que já existe (escolhida).** A
   checagem que já rodava ao abrir passa a ser esperada pela janelinha (com prazo), o download
   já existente é pedido sem o sorteio, e o "pronto" (já verificado) instala sem clique enquanto
   a janela principal ainda nem existe. É o padrão comum em apps Electron (checar no main com a
   janela de espera, com timeout, e criar a janela principal depois).
4. **Seguir só com o aviso na barra** (o que o VS Code faz). Não atende o pedido.

## Decisão

Opção 3:

- `updates/startupFlow.ts`, pura: checando → baixando → instalando → abrindo, com prazos
  (checagem 5 s; download sem progresso 30 s; instalação 90 s), "Abrir sem atualizar" depois de
  3 s baixando e qualquer falha (checagem, download, assinatura, extração, instalador) indo para
  "abrindo" com registro em `logs/update.log` (agora também no Windows).
- `updater.ts` devolve um `StartupUpdate` (`check`, `download`, `watch`) e avisa a janelinha
  do progresso, da verificação, do "pronto" e das falhas. A instalação sem clique ao abrir só
  acontece pela janelinha: `installOnStartup` e a marca `update-verified.json` saem (o download
  em cache — electron-updater e updater do Linux — já torna o segundo "baixar" instantâneo).
  Pulou ou a janelinha já abriu o app: a versão que fica pronta depois só gera o aviso de sempre.
- `splash/`: janela 300×340 sem moldura, sem preload, `sandbox` + `contextIsolation`, página
  estática montada em TS e carregada como `data:` URL com CSP `default-src 'none'`. O main
  atualiza o texto por `executeJavaScript` com JSON; o botão "Abrir sem atualizar" troca o hash
  e o main escuta `did-navigate-in-page` (sem IPC nenhum). Cores do tema salvas pela barra de
  título (`splash-theme.json`); sem tema salvo, o escuro padrão.
- Iniciado pelo login: janelinha fora da barra de tarefas e sem roubar o foco (`showInactive`),
  some assim que a janela principal (escondida) é criada. O instalador NSIS reabre o app só com
  `--updated`, sem o `--hidden`: antes de instalar, a janelinha grava `splash-hidden.json` (vale
  uma vez, por 10 min) para a reabertura continuar na bandeja.

## Consequências

- Abrir com versão nova demora o download (~120 MB) — o pedido do dono —, com progresso real e
  o botão para pular. Sem versão nova, a janelinha fica só o tempo da escolha do servidor e da
  checagem (o manifesto tem poucos bytes).
- No Windows a instalação silenciosa do NSIS roda com o app fechado: entre "Instalando…" e a
  reabertura não há janela (alguns segundos).
- A janelinha abre um processo de renderer a mais por alguns segundos na abertura.
- Mais difícil: mudar o texto da janelinha exige build novo (é constante no main).

## Fontes

- [Element Desktop: updater no main com checagem manual](https://github.com/element-hq/element-desktop/blob/develop/src/updater.ts)
- [electron-builder: auto update](https://www.electron.build/auto-update)
- [Electron: segurança (sandbox, contextIsolation, CSP)](https://www.electronjs.org/docs/latest/tutorial/security)
