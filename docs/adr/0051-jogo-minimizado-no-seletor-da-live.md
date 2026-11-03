# 0051. Jogo minimizado no seletor da live

- Status: aceito
- Data: 2026-11-02
- Relacionado: [0050](0050-captura-com-a-janela-coberta.md)

## Contexto

Jogo em tela cheia se minimiza ao perder o foco, e o Chromium não lista nem captura janela
minimizada. Para abrir o seletor a pessoa sai do jogo, e com isso ele some da aba
"Aplicativos". Medido em Windows 11, VALORANT em tela cheia, 2560×1440:

- Com o jogo à frente, ele está na lista e a captura sai: 55 fps com imagem real, pela janela
  e pelo monitor. O que falhava era só o caminho até escolher.
- Depois de um alt-tab: `IsIconic` verdadeiro e fora da lista.
- Dar só o foco (`AppActivate`) não restaura: o jogo seguiu minimizado por 25 s.
  `ShowWindowAsync` com `SW_RESTORE` restaura em 8 ms.
- O Windows só deixa trazer a janela para a frente a partir do app em foco.

A lista também trazia `D3DProxyWindow`, janela interna do jogo, às vezes marcada por padrão.

## Opções

1. **Oferecer as janelas minimizadas e restaurar a escolhida (escolhida).** Sem dependência nova.
2. **Atalho global para iniciar a live de dentro do jogo.** Não precisa sair do jogo, mas é uma
   funcionalidade nova, com tecla para escolher e conflitos com o jogo.
3. **Avisar para usar "tela cheia em janela".** Não exige código, mas joga o problema em cima
   de quem usa.
4. **Captura nativa** (ADR 0031). Resolveria mais coisas, mas é bem maior.

## Decisão

O seletor lista também as janelas principais minimizadas dos outros apps, sem miniatura. Ao
escolher uma, ou no card do jogo, o processo principal a restaura e espera ela voltar à lista,
por 24 tentativas a cada 500 ms; depois disso recusa o pedido. `D3DProxyWindow` sai da lista.

## Consequências

- Escolher um jogo minimizado o traz para a frente: a live começa em ~6 s, com a pessoa de
  volta no jogo.
- Qualquer janela minimizada aparece na lista, não só jogos. Sem miniatura, para não mostrar
  o conteúdo dela.
- Listar custa um PowerShell a mais em segundo plano a cada abertura do seletor.
- Alt-tab com a live no ar continua congelando a imagem, como antes, com o aviso que já existe.
  Ao voltar ao jogo, a live volta sozinha.
- Só no Windows. Em tela cheia exclusiva de verdade, sem as otimizações do Windows, a WGC pode
  não capturar: o Discord documenta essa limitação para o método dele e recomenda sem bordas.

## Fontes

- [Discord: capturing application window](https://support.discord.com/hc/en-us/articles/9410427556375--Windows-Capturing-Application-Window-for-Screen-Share-and-Go-Live)
